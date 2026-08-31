import z from "zod";
import { type BiliTypes, type AppContext } from "../types";
import BiliVideoParser from "../services/video-parser";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliVideoRoute extends APIRoute {

    private readonly formatFnvalMap: Record<string, number> = {
        flv: 0,
        mp4: 1,
        dash: 4048
    }

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
            const processed = await this.getBvParamsFromUrl(url)
            if (!processed) {
                throw new Error("cannot get bvid from url")
            }
            bvid = processed.bvid
            p = processed.p
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

        const parser = new BiliVideoParser()
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BiliVideoInfoCacheTime, Validation.videoInfoSchema)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }

        const targetCid = targetPart.cid
        const urlKey = this.CacheKey.videoPlayUrl(targetCid, qn, platform, format)

        let videoPlay = await this.getCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(ctx, urlKey, Validation.videoPlaySchema)
        if (!videoPlay) {
            const duration = videoInfo.duration
            //overload
            videoPlay = await parser.getVideoPlayUrl(bvid, targetCid, qn, platform, format as any) as BiliTypes.RES.Video.PlayDash | BiliTypes.RES.Video.PlayURL
            //以真实qn进行缓存
            let realQn: number | null = null
            if (videoPlay.isDash) {
                if (videoPlay.dash.video) {
                    realQn = Math.max(...videoPlay.dash.video.map(i => i.quality))
                }
            }
            else {
                realQn = videoPlay.quality
            }
            if (realQn) {
                const setUrlKey = this.CacheKey.videoPlayUrl(targetCid, realQn, platform, format)
                await this.setCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(ctx, setUrlKey, videoPlay, (data) => {
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
                }, Validation.videoPlaySchema)
            }
        }
        this.resHeaders.set("x-url-cid", String(targetCid))
        this.resHeaders.set("x-url-vpart", String(p))

        const video: BiliTypes.RES.Video.Video = {
            ...videoInfo,
            play: {
                ...videoPlay
            }
        }
        return video
    }

    protected switchDashCDN(ctx: AppContext, dash: BiliTypes.RES.Video.PlayDash['dash'], cdn?: keyof BiliTypes.BiliVideoCDN) {
        const replaceHost = <T extends BiliTypes.RES.Video.AudioDashItem | BiliTypes.RES.Video.VideoDashItem>(dashItem: T) => {
            dashItem.baseUrl = this.autoSwitchCDN(ctx, dashItem.baseUrl, cdn)
            dashItem.backupUrl = dashItem.backupUrl.map(u => this.autoSwitchCDN(ctx, u, cdn))
            return dashItem
        }
        dash.video = dash.video ? dash.video.map(replaceHost) : dash.video
        dash.audio = dash.audio ? dash.audio.map(replaceHost) : dash.audio
        dash.dobly = dash.dobly ? dash.dobly.map(replaceHost) : dash.dobly
        dash.flac = dash.flac ? dash.flac.map(replaceHost) : dash.flac
        return dash
    }

    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            const reqUrl = new URL(ctx.req.url)
            const pathname = reqUrl.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
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
                return this.jsonResponse(ctx, parmas.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, platform, cdn, qn, p: page, format } = parmas.data
            const bvid = parmas.data.bvid!

            const result = await this.parseBiliVideo(ctx, bvid, page, qn, platform, format)
            if (result.play.isDash) {
                result.play.dash = this.switchDashCDN(ctx, result.play.dash, cdn)
            }
            else {
                result.play.url = this.autoSwitchCDN(ctx, result.play.url, cdn)
                result.play.backupUrl = result.play.backupUrl.map(i => this.autoSwitchCDN(ctx, i, cdn))
            }

            if (result.play.isDash) {
                return this.jsonResponse<BiliTypes.RES.Video.Video>(ctx, "Success", 200, result, Validation.videoSchema)
            }
            else {
                switch (type) {
                    case "json":
                        return this.jsonResponse<BiliTypes.RES.Video.Video>(ctx, "Success", 200, result, Validation.videoSchema)
                    case "video":
                    default:
                        const redirectResponse = new Response(null, {
                            status: 302,
                            headers: new Headers({
                                ...this.headers,
                                'Location': result.play.url,
                                'X-BVID': bvid
                            })
                        })
                        return redirectResponse
                }
            }
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}
