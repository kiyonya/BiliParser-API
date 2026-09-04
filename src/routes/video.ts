import z from "zod";
import { type BiliTypes, type AppContext } from "../types";
import BiliVideoParser from "../services/video-parser";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliVideoRoute extends APIRoute {

    private readonly PARAMS = z.object({
        type: z.enum(["video", "json"]).default("video"),
        cdn: z.enum(Object.keys(this.CDNS) as (keyof BiliTypes.BiliVideoCDN)[]).optional(),
        qn: z.enum(["6", "16", "32", "64", "74", "80", "100", "112", "116", "120", "125", "126", "127", "129"]).default("64").transform((qn) => parseInt(qn)),
        format: z.enum(['mp4', 'dash']).default('mp4'),
        platform: z.enum(['html5', 'pc', 'app']).default('html5'),
        url: z.url().optional(),
        bvid: z.string().optional(),
        p: z.coerce.number().nonnegative().int().default(1).transform(p => p === 0 ? 1 : p)
    }).transform(async (args) => {
        let { bvid, p, url, qn, platform } = args
        if (url) {
            const processed = await this.utils.getUrlBv(url)
            if (!processed) {
                throw new Error("cannot get bvid from url")
            }
            bvid = processed.bvid
            p = processed.p
        }
        if (!Config.isServerLogin) {
            qn = Math.min(qn, 80)
        }
        return { ...args, p: p, bvid: bvid, platform, qn }
    }).superRefine((args, ctx) => {
        if (!args.bvid) {
            ctx.addIssue("cannot find bvid to parse")
        }
        if (args.format === 'dash' && args.platform === 'html5' && !Config.isServerLogin) {
            ctx.addIssue("Your request is fine, but when the platform is html5 and the format is dash, the server must be logged in. The current server is running offline, so please try changing the platform to app or pc.")
        }
    })

    private async parseBiliVideo(ctx: AppContext, bvid: string, p: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.Video> {

        const parser = new BiliVideoParser(ctx)
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await ctx.cache.getCache(infoKey, Validation.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await parser.getVideoInfo(bvid)
            await ctx.cache.setCache(infoKey, videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME, Validation.videoInfoSchema)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }

        const targetCid = targetPart.cid
        const urlKey = this.CacheKey.videoPlayUrl(targetCid, qn, platform, format, Config.serverLoginKeyHash)

        let videoPlay = await ctx.cache.getCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(urlKey, Validation.videoPlaySchema)
        if (!videoPlay) {
            const duration = videoInfo.duration
            videoPlay = await parser.getVideoPlayUrl(bvid, targetCid, qn, platform, format as any) as BiliTypes.RES.Video.PlayDash | BiliTypes.RES.Video.PlayURL
            await ctx.cache.setCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(urlKey, videoPlay, (data) => {
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
                const userExpirationS = this.nowS + Config.BILI_VIDEO_PLAYURL_CACHE_TIME
                const expiration: number = Math.min(videoExpirationS, userExpirationS)
                return expiration
            }, Validation.videoPlaySchema)
        }

        ctx.header('X-Url-Cid', String(targetCid))
        ctx.header('X-Url-Part', String(p))

        const video: BiliTypes.RES.Video.Video = {
            ...videoInfo,
            play: {
                ...videoPlay
            }
        }
        return video
    }

    public override async invoke(ctx: AppContext): Promise<Response> {
        try {
            const reqUrl = new URL(ctx.req.url)
            const parmas = await this.PARAMS.safeParseAsync({
                type: reqUrl.searchParams.get('type') || undefined,
                platform: reqUrl.searchParams.get('platform') || undefined,
                format: reqUrl.searchParams.get("format") || undefined,
                cdn: reqUrl.searchParams.get('cdn') || undefined,
                qn: reqUrl.searchParams.get('qn') || undefined,
                bvid: ctx.req.param('bvid') || reqUrl.searchParams.get('bvid') || undefined,
                url: reqUrl.searchParams.get('url') || undefined,
                p: ctx.req.param("p") || reqUrl.searchParams.get('p') || undefined
            })

            if (!parmas.success) {
                return ctx.jsonResp(parmas.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, platform, cdn, qn, p: page, format } = parmas.data
            const bvid = parmas.data.bvid!


            const result = await this.parseBiliVideo(ctx, bvid, page, qn, platform, format)
            if (result.play.isDash) {
                result.play.dash = this.utils.switchDashCDN(ctx, result.play.dash, cdn)
            }
            else {
                result.play.url = this.utils.switchCDN(ctx, result.play.url, cdn)
                result.play.backupUrl = result.play.backupUrl.map(i => this.utils.switchCDN(ctx, i, cdn))
            }

            if (result.play.isDash) {
                return ctx.jsonResp<BiliTypes.RES.Video.Video>("Success", 200, result, Validation.videoSchema)
            }
            else {
                switch (type) {
                    case "json":
                        return ctx.jsonResp<BiliTypes.RES.Video.Video>("Success", 200, result, Validation.videoSchema)
                    case "video":
                    default:
                        ctx.header("X-Bili-Bvid", bvid)
                        return ctx.redirect(result.play.url, 302)
                }
            }
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}
