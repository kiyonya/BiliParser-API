import z from "zod";
import Route from "../utils/api-route";
import { AppContext, BiliTypes } from "../types";
import BiliVideoParser from "../services/video-parser";
import { Schema } from "../shared/schema";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliCoverRoute extends Route {

    protected readonly paramSchema = z.object({
        url: this.utils.zodBiliUrl([SharedData.URLPatterns.BILI_VIDEO, SharedData.URLPatterns.B23_TV], "url must be a bilibili video page or b23.tv short link").optional(),
        id: z.string().optional(),
        type: z.enum(['url', 'redirect']).optional()
    })
    .transform(this.utils.zodBiliVideoIdTransformer)
    .superRefine((args, ctx) => {
        if (!args.videoId) {
            ctx.addIssue("cannot resolve video id: no valid url, bvid or avid was provided, so the video cannot be parsed")
        }
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = await this.paramSchema.safeParseAsync({
                url: url.searchParams.get('url') || undefined,
                id: ctx.req.param('id') || url.searchParams.get('bvid') || url.searchParams.get('avid') || undefined,
                type: url.searchParams.get('type') || undefined
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            let { type } = params.data
            const videoId = params.data.videoId!

            const infoKey = videoId.type === 'bvid' ? SharedData.cacheKey.videoInfoBv(videoId.id) : SharedData.cacheKey.videoInfoAv(videoId.id)

            let videoInfo = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.Video.VideoInfo>(infoKey), Schema.videoInfoSchema)

            if (!videoInfo) {
                const parser: BiliVideoParser = new BiliVideoParser(ctx)
                videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(videoId), Schema.videoInfoSchema, true)

                const setCacheTasks: Promise<void>[] = []
                if (videoInfo.bvid) {
                    setCacheTasks.push(ctx.cache.setCache(SharedData.cacheKey.videoInfoBv(videoInfo.bvid), videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME))
                }
                if (videoInfo.aid) {
                    setCacheTasks.push(ctx.cache.setCache(SharedData.cacheKey.videoInfoAv(videoInfo.aid), videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME))
                }
                await Promise.allSettled(setCacheTasks)
            }
            const imgUrl = videoInfo.pic
            switch (type) {
                case "url":
                    return ctx.text(imgUrl, 200)
                case 'redirect':
                default:
                    return ctx.redirect(imgUrl, 302)
            }
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}