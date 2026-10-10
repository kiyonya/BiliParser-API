import z from "zod";
import BiliVideoParser from "../services/video-parser";
import SharedData from "../shared/data";
import { API, BadRequestError } from "./api";
import { BiliTypes } from "../types/bili";
import { Schema } from "../shared/schema";
import { AppContext } from "../types/app";

export class VideoAPI extends API {

    private readonly paramSchema = z.object({
        type: z.enum(["video", "json"]).default("video"),
        cdn: z.string().optional(),
        qn: z.enum(["6", "16", "32", "64", "74", "80", "100", "112", "116", "120", "125", "126", "127", "129"]).default("64").transform((qn) => parseInt(qn)),
        format: z.enum(['mp4', 'dash']).default('mp4'),
        platform: z.enum(['html5', 'pc', 'app']).default('html5'),
        allocation: z.string().optional(),
        url: this.utils.zodBiliUrl([SharedData.URLPatterns.BILI_VIDEO, SharedData.URLPatterns.B23_TV], "url must be a bilibili video page or b23.tv short link").optional(),
        id: z.string().optional(),
        p: z.coerce.number().nonnegative().int().default(1).transform(p => p === 0 ? 1 : p)
    })
        .transform(this.utils.zodBiliVideoIdTransformer)
        .superRefine((args, ctx) => {
            if (!args.videoId) {
                ctx.addIssue("cannot resolve video id: no valid url, bvid or avid was provided, so the video cannot be parsed")
            }
        })

    private async parseBiliVideo(ctx: AppContext, videoId: BiliTypes.BVideoId, p: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.Video> {
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
        const urlKey = ctx.appCacheKey.videoPlayUrl(targetCid, qn, platform, format, ctx.config.SERVER_LOGIN_HASHKEY)

        let videoPlay = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(urlKey), Schema.videoPlaySchema)

        if (!videoPlay) {
            const duration = videoInfo.duration

            videoPlay = await this.getSchemaValidData(await parser.getVideoPlayUrl(videoId, targetCid, qn, platform, format as any) as BiliTypes.RES.Video.PlayDash | BiliTypes.RES.Video.PlayURL, Schema.videoPlaySchema, true)

            await ctx.appCache.setCache<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash>(urlKey, videoPlay, (data) => {
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
                const userExpirationS = this.nowS + ctx.config.BILI_VIDEO_PLAYURL_CACHE_TIME
                const expiration: number = Math.min(videoExpirationS, userExpirationS)
                return expiration
            })
        }

        ctx.header("X-Video-Id",String(videoId.id))
        ctx.header("X-Video-Cid",String(targetCid))
        ctx.header("X-Video-Part",String(p))

        const video: BiliTypes.RES.Video.Video = {
            ...videoInfo,
            play: {
                ...videoPlay
            }
        }
        return video
    }

    public override async handler(ctx: AppContext): Promise<Response> {
        const url = new URL(ctx.req.url)

        const parmas = await this.paramSchema.safeParseAsync({
            type: url.searchParams.get('type') || undefined,
            platform: url.searchParams.get('platform') || undefined,
            format: url.searchParams.get("format") || undefined,
            cdn: url.searchParams.get('cdn') || undefined,
            qn: url.searchParams.get('qn') || undefined,
            id: ctx.req.param("id") || url.searchParams.get('bvid') || url.searchParams.get("avid") || undefined,
            url: url.searchParams.get('url') || undefined,
            p: ctx.req.param("p") || url.searchParams.get('p') || undefined,
            allocation: url.searchParams.get("allocation") || undefined
        })

        if (!parmas.success) {
            throw new BadRequestError(parmas.error.issues[0]?.message ?? "invalid params")
        }
        let { type, platform, cdn, qn, format, allocation, p } = parmas.data

        if (!ctx.config.IS_SERVER_LOGIN) {
            if (format === 'dash' && platform === 'html5') {
                throw new BadRequestError("Your request is fine, but when the platform is html5 and the format is dash, the server must be logged in. The current server is running offline, so please try changing the platform to app or pc.")
            }
            qn = Math.min(qn, 80)
        }

        const videoId = parmas.data.videoId!

        const result = await this.parseBiliVideo(ctx, videoId, p, qn, platform, format)
        if (result.play.isDash) {
            result.play.dash = this.utils.switchDashCDN(ctx, result.play.dash, cdn, allocation)
        }
        else {
            result.play.url = this.utils.switchVideoCDN(ctx, result.play.url, cdn, allocation)
            result.play.backupUrl = result.play.backupUrl.map(i => this.utils.switchVideoCDN(ctx, i, cdn, allocation))
        }

        if (result.play.isDash) {
            return ctx.jsonResp<BiliTypes.RES.Video.Video>("Success", 200, result)
        }
        else {
            switch (type) {
                case "json":
                    return ctx.jsonResp<BiliTypes.RES.Video.Video>("Success", 200, result)
                case "video":
                default:
                    return ctx.redirect(result.play.url, 302)
            }
        }
    }
}
