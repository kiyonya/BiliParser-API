import z from "zod";
import { type BiliTypes, type AppContext } from "../types";
import BiliVideoParser from "../services/video-parser";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliVideoRoute extends APIRoute {

    private readonly PARAMS = z.object({
        type: z.enum(["video", "json", "url"]).default("video"),
        platform: z.enum(["web", "app"]).default('web'),
        cdn: z.enum(Object.keys(this.CDNS)).optional(),
        qn: z.coerce.number().pipe(z.literal(64)).default(64),
        url: z.url().optional(),
        bvid: z.string().optional(),
        p: z.coerce.number().nonnegative().int().default(1).transform((p) => p === 0 ? 1 : p)
    }).superRefine((args, ctx) => {
        if (!args.bvid && !args.url) {
            ctx.addIssue("must provided url or bvid to parse video")
        }
    })

    private async parseBiliVideo(ctx: AppContext, bvid: string, p: number, qn: number, platform: BiliTypes.BVideoPlatform): Promise<BiliTypes.RES.Video.Video> {

        const parser = new BiliVideoParser()
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.validVideoInfo)

        if (!videoInfo) {
            videoInfo = await parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BiliVideoInfoCacheTime, Validation.validVideoInfo)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }
        const targetCid = targetPart.cid
        const urlKey = this.CacheKey.videoPlayUrl(targetCid, qn, platform)
        let playUrl = await this.getCache<BiliTypes.RES.Video.PlayURL>(ctx, urlKey, Validation.validPlayUrl)
        if (!playUrl) {
            const duration = videoInfo.duration
            playUrl = await parser.getVideoPlayUrl(bvid, targetCid, qn, platform)
            await this.setCache<BiliTypes.RES.Video.PlayURL>(ctx, urlKey, playUrl, (data) => {
                let videoBufferTimeS: number
                if (duration < 60 * 10) {
                    videoBufferTimeS = 60
                }
                else if (duration < 3600) {
                    videoBufferTimeS = Math.min(duration * 0.1, 10 * 60)
                }
                else {
                    videoBufferTimeS = Math.min(duration * 0.05, 20 * 60)
                }
                const videoExpirationS = data.urlExpirationAt - videoBufferTimeS
                const userExpirationS = this.nowS + Config.BiliVideoPlayUrlCacheTime
                const expiration: number = Math.min(videoExpirationS, userExpirationS)
                return expiration
            }, Validation.validPlayUrl)

        }
        this.resHeaders.set("x-url-cid", String(targetCid))
        this.resHeaders.set("x-url-vpart", String(p))
        return {
            ...videoInfo,
            ...playUrl,
            urlVideoPart: p,
            urlCid: targetCid
        }
    }

    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            const reqUrl = new URL(ctx.req.url)
            const pathname = reqUrl.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const parmas = this.PARAMS.safeParse({
                type: reqUrl.searchParams.get('type') || undefined,
                platform: reqUrl.searchParams.get('platform') || undefined,
                cdn: reqUrl.searchParams.get('cdn') || undefined,
                qn: reqUrl.searchParams.get('qn') || undefined,
                bvid: ctx.req.param('bvid') || reqUrl.searchParams.get('bvid') || undefined,
                url: reqUrl.searchParams.get('url') || undefined,
                p: ctx.req.param("p") || reqUrl.searchParams.get('p') || undefined
            })

            if (!parmas.success) {
                return this.jsonResponse(ctx, "invalid params", 400, null)
            }
            let { type, platform, cdn, qn, bvid, url, p: page } = parmas.data
            if (!bvid && url) {
                const processed = await this.getBvParamsFromUrl(url)
                if (processed) {
                    bvid = processed.bvid
                    page = processed.p
                }
            }
            if (!bvid) {
                return this.jsonResponse(ctx, "cannot get bvid to parse", 400, null)
            }

            const result = await this.parseBiliVideo(ctx, bvid, page, qn, platform)
            result.url = this.autoSwitchBiliCdn(ctx, result.url, cdn as any)

            switch (type) {
                case "json":
                    return this.jsonResponse<BiliTypes.RES.Video.Video>(ctx, "Success", 200, result)
                case "url":
                    return ctx.text(result.url, 200)
                case "video":
                default:
                    const redirectResponse = new Response(null, {
                        status: 302,
                        headers: new Headers({
                            ...this.headers,
                            'Location': result.url,
                            'X-BVID': bvid
                        })
                    })
                    return redirectResponse
            }

        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}
