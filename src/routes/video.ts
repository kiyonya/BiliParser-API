import z from "zod";
import { type BiliTypes, type AppContext } from "../types";
import BiliVideoParser from "../services/video-parser";
import { b23Parser } from "../utils/b23-parse";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliVideoRoute extends APIRoute {

    private readonly PARAMS = z.object({
        type: z.enum(["video", "json", "url"]).default("video"),
        platform: z.enum(["web", "app"]).default('web'),
        cdn: z.enum(Object.keys(this.CDNS)).optional(),
        qn: z.coerce.number().pipe(z.literal(64)).default(64),
        url: z.url("*.bilibili.com/video/*").optional(),
        bvid: z.string().optional()
    })

    private async getBvidFromURL(biliurl: string | URL): Promise<string | undefined> {

        const BILI_VIDEO_URLPATTERN = new URLPattern({ hostname: "*.bilibili.com", pathname: "/video/*" })
        const BILI_BTV_URLPATTERN = new URLPattern({ hostname: "b23.tv" })
        const BV_PATTERN = new RegExp(/(BV[a-zA-Z0-9]{10})/)

        let url: URL = new URL(biliurl)
        if (BILI_BTV_URLPATTERN.test(url)) {
            const rawURL = await b23Parser(url.toString())
            url = new URL(rawURL)
        }
        if (BILI_VIDEO_URLPATTERN.test(url)) {
            const pathname = url.pathname
            const bvid = pathname.match(BV_PATTERN)?.[1]
            if (bvid) {
                return bvid
            }
        }
        return undefined
    }

    private createInfoCacheKey(bvid: string) {
        return `info_${bvid}`
    }

    private createUrlCacheKey(bvid: string, qn: number, platform: BiliTypes.BVideoPlatform) {
        return `playurl_${bvid}_${platform}_${qn}`
    }

    private async parseBiliVideo(ctx: AppContext, bvid: string, qn: number, platform: BiliTypes.BVideoPlatform): Promise<BiliTypes.RES.Video.Video> {

        const parser = new BiliVideoParser()
        const infoKey = this.createInfoCacheKey(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.validVideoInfo)
        if (!videoInfo) {
            videoInfo = await parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BiliVideoInfoCacheTime, Validation.validVideoInfo)
        }

        const urlKey = this.createUrlCacheKey(bvid, qn, platform)
        let playUrl = await this.getCache<BiliTypes.RES.Video.PlayURL>(ctx, urlKey, Validation.validPlayUrl)
        if (!playUrl) {
            const cid = videoInfo.cid
            const duration = videoInfo.duration
            playUrl = await parser.getVideoPlayUrl(bvid, cid, qn, platform)
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
        return {
            ...videoInfo,
            ...playUrl
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
                url: reqUrl.searchParams.get('url') || undefined
            })

            if (!parmas.success) {
                return this.jsonResponse(ctx, "invalid params", 400, null)
            }
            let { type, platform, cdn, qn, bvid, url } = parmas.data
            if (!bvid && url) {
                bvid = await this.getBvidFromURL(url)
            }
            if (!bvid) {
                return this.jsonResponse(ctx, "cannot get bvid to parse", 400, null)
            }

            const result = await this.parseBiliVideo(ctx, bvid, qn, platform)
            result.url = this.autoSwitchBiliCdn(ctx, result.url, cdn as any)

            switch (type) {
                case "json":
                    return this.jsonResponse<BiliTypes.RES.Video.Video>(ctx, "Success", 200, result)
                case "url":
                    return ctx.text(result.url, 200)
                case "video":
                default:
                    return ctx.redirect(result.url, 302)
            }

        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}
