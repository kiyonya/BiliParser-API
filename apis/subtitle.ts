import z from "zod";
import BiliVideoParser from "../services/video-parser";
import SharedData from "../shared/data";
import { API, BadRequestError } from "./api";
import { BiliTypes } from "../types/bili";
import { AppContext } from "../types/app";
import { Schema } from "../shared/schema";

export class SubtitleAPI extends API {

    private readonly paramSchema = z.object({
        url: this.utils.zodBiliUrl([SharedData.URLPatterns.BILI_VIDEO, SharedData.URLPatterns.B23_TV], "url must be a bilibili video page or b23.tv short link").optional(),
        id: z.string().optional(),
        p: z.coerce.number().nonnegative().int().optional().default(1).transform(p => p === 0 ? 1 : p),
        lang: z.string().optional(),
        type: z.enum(["srt", "json", "info"]).optional().default("info")
    })
        .transform(this.utils.zodBiliVideoIdTransformer)
        .superRefine((args, ctx) => {
            if (!args.videoId) {
                ctx.addIssue("cannot resolve video id: no valid url, bvid or avid was provided, so the video cannot be parsed")
            }
        })

    protected async parseSubtitle(ctx: AppContext, videoId: BiliTypes.BVideoId, p: number = 1): Promise<BiliTypes.RES.Subtitle.SubtitleItem[]> {
        const parser = new BiliVideoParser(ctx)
        const infoKey = videoId.type === 'bvid' ? ctx.appCacheKey.videoInfoBv(videoId.id) : ctx.appCacheKey.videoInfoAv(videoId.id)

        let videoInfo = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.Video.VideoInfo>(infoKey), Schema.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(videoId), Schema.videoInfoSchema, true)

            const setCacheTasks: Promise<void>[] = []
            if (videoInfo.bvid) {
                setCacheTasks.push(ctx.appCache.setCache(ctx.appCacheKey.videoInfoBv(videoInfo.bvid), videoInfo, this.nowS + ctx.config.BILI_VIDEO_INFO_CACHE_TIME))
            }
            if (videoInfo.aid) {
                setCacheTasks.push(ctx.appCache.setCache(ctx.appCacheKey.videoInfoAv(videoInfo.aid), videoInfo, this.nowS + ctx.config.BILI_VIDEO_INFO_CACHE_TIME))
            }
            await Promise.allSettled(setCacheTasks)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }
        const targetCid = targetPart.cid

        const subtitlesKey = ctx.appCacheKey.videoSubtitles(targetCid)

        let subtitles = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.Subtitle.SubtitleItem[]>(subtitlesKey), z.array(Schema.videoSubtitleItemSchema))

        if (!subtitles) {

            subtitles = await this.getSchemaValidData(await parser.getVideoSubtitles(videoId, targetCid), z.array(Schema.videoSubtitleItemSchema), true)

            if (subtitles.length) {
                await ctx.appCache.setCache(subtitlesKey, subtitles, this.nowS + ctx.config.BILI_VIDEO_SUBTITLES_CACHE_TIME)
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

    public override async handler(ctx: AppContext) {
        if (!ctx.config.IS_SERVER_LOGIN) {
            throw new BadRequestError("This API can be used and your request is fine, but getting subtitles requires the server to be logged in. Right now the server is offline, so sorry, we can't handle your request this time.")
        }
        const url = new URL(ctx.req.url)
        const params = await this.paramSchema.safeParseAsync({
            url: url.searchParams.get("url") || undefined,
            id: ctx.req.param("id") || url.searchParams.get('bvid') || url.searchParams.get("avid") || undefined,
            p: ctx.req.param("p") || url.searchParams.get("p") || undefined,
            lang: url.searchParams.get("lang") || undefined,
            type: url.searchParams.get('type') || undefined
        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }
        const { p, lang, type } = params.data

        const videoId = params.data.videoId!
        const subtitles = await this.parseSubtitle(ctx, videoId, p)

        if (lang) {
            const targetLangSubtitle = subtitles.filter(i => i.lang.toLowerCase() === lang.toLowerCase())[0]
            if (targetLangSubtitle) {
                switch (type) {
                    case 'info':
                    default:
                        return ctx.jsonResp('ok', 200, targetLangSubtitle)
                    case "srt":
                        const srt = await this.createSRT(targetLangSubtitle)
                        return ctx.text(srt, 200)
                    case "json":
                        const json = await this.fetchSubtitleJson(targetLangSubtitle.originalJsonUrl)
                        return ctx.json(json, 200)
                }
            }
            else {
                return ctx.jsonResp('not found', 404, null)
            }
        }
        return ctx.jsonResp('ok', 200, subtitles)
    }
}