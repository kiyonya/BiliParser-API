import z from "zod";
import APIRoute from "../utils/api-route";
import { AppContext, BiliTypes } from "../types";
import BiliVideoParser from "../services/video-parser";
import { Validation } from "../validation";
import { Config } from "../config";

export class SubtitleRoute extends APIRoute {

    private readonly PARAMS = z.object({
        url: z.url().optional(),
        bvid: z.string().optional(),
        p: z.coerce.number().nonnegative().int().optional().default(1).transform(p => p === 0 ? 1 : p),
        lang: z.string().optional(),
        type: z.enum(["srt", "json", "info"]).optional().default("info")
    }).transform(async (args) => {
        let { bvid, p, url } = args
        if (url) {
            const processed = await this.getBvParamsFromUrl(url)
            if (!processed) {
                throw new Error("cannot get bvid from url")
            }
            bvid = processed.bvid
            p = processed.p
        }
        return { ...args, bvid, p }
    }).superRefine((args, ctx) => {
        if (!args.bvid) {
            ctx.addIssue("cannot find bvid to parse")
        }
        if(!Config.isServerLogin){
            ctx.addIssue("This API can be used and your request is fine, but getting subtitles requires the server to be logged in. Right now the server is offline, so sorry, we can't handle your request this time.")
        }
    })

    protected async parseSubtitle(ctx: AppContext, bvid: string, p: number = 1): Promise<BiliTypes.RES.Subtitle.SubtitleItem[]> {
        const parser = new BiliVideoParser()
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME, Validation.videoInfoSchema)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }
        const targetCid = targetPart.cid

        const subtitlesKey = this.CacheKey.videoSubtitles(targetCid)
        let subtitles = await this.getCache<BiliTypes.RES.Subtitle.SubtitleItem[]>(ctx, subtitlesKey)
        if (!subtitles) {
            subtitles = await parser.getVideoSubtitles(bvid, targetCid)
            if (subtitles.length) {
                await this.setCache(ctx, subtitlesKey, subtitles, this.nowS + Config.BILI_VIDEO_SUBTITLES_CACHE_TIME)
            }
        }
        return subtitles
    }

    protected async fetchSubtitleJson(url: string) {
        if (!url) {
            throw new Error("cannot find jsonurl to parse")
        }
        const req = await fetch(url)
        console.log(req)
        const json = await req.json() as { body: { from: number, to: number, location: number, content: string }[] }
        return json
    }

    protected async createSRT(item: BiliTypes.RES.Subtitle.SubtitleItem): Promise<string> {
        const jsonUrl = item.originalJsonUrl
        const subtitleJson = await this.fetchSubtitleJson(jsonUrl)

        const float2hhmm = (num: number) => {
            const intPart = Math.floor(num);
            const frac = Math.round((num - intPart) * 1000);
            const hr = Math.floor(intPart / 3600);
            const min = Math.floor((intPart % 3600) / 60);
            const sec = intPart % 60;
            return `${hr}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${frac.toString().padStart(3, '0')}`;
        }

        const srt: string[] = []
        let i = 1
        for (const b of subtitleJson.body || []) {
            const s = float2hhmm(b.from)
            const e = float2hhmm(b.to)
            const srtpt = `${i}\n${s} --> ${e}\n${b.content}`
            srt.push(srtpt)
            i++
        }
        return srt.join("\n\n")
    }

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            
            const params = await this.PARAMS.safeParseAsync({
                url: url.searchParams.get("url") || undefined,
                bvid: ctx.req.param("bvid") || url.searchParams.get("bvid") || undefined,
                p: ctx.req.param("p") || url.searchParams.get("p") || undefined,
                lang: url.searchParams.get("lang") || undefined,
                type: url.searchParams.get('type') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { p, lang, type } = params.data
            const bvid = params.data.bvid!
            const subtitles = await this.parseSubtitle(ctx, bvid, p)

            if (lang) {
                const targetLangSubtitle = subtitles.filter(i => i.lang.toLowerCase() === lang.toLowerCase())[0]
                if (targetLangSubtitle) {
                    switch (type) {
                        case 'info':
                        default:
                            return this.jsonResponse(ctx, 'ok', 200, targetLangSubtitle, Validation.videoSubtitleItemSchema)
                        case "srt":
                            const srt = await this.createSRT(targetLangSubtitle)
                            return ctx.text(srt, 200, {
                                ...this.headers,
                            })
                        case "json":
                            const json = await this.fetchSubtitleJson(targetLangSubtitle.originalJsonUrl)
                            return ctx.json(json, 200, {
                                ...this.headers
                            })
                    }
                }
                else {
                    return this.jsonResponse(ctx, 'not found', 404, null)
                }
            }

            return this.jsonResponse(ctx, 'ok', 200, subtitles, z.array(Validation.videoSubtitleItemSchema))
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}