import z from "zod";
import APIRoute from "../utils/api-route";
import { AppContext, BiliTypes } from "../types";
import BiliVideoParser from "../services/video-parser";
import { Config } from "../config";
import { Validation } from "../validation";

export class BiliCoverRoute extends APIRoute {

    protected readonly PARAMS = z.object({
        url: z.url().optional(),
        bvid: z.string().optional(),
        type: z.enum(['url', 'redirect']).optional()
    }).transform(async (args) => {
        let { bvid, url } = args
        if (url) {
            const processed = await this.utils.getUrlBv(url)
            if (!processed) {
                throw new Error("cannot get bvid from url")
            }
            bvid = processed.bvid
        }
        return { ...args, bvid }
    }).superRefine((args, ctx) => {
        if (!args.bvid) {
            ctx.addIssue("cannot find bvid to parse")
        }
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = await this.PARAMS.safeParseAsync({
                url: url.searchParams.get('url') || undefined,
                bvid: ctx.req.param('bvid') || url.searchParams.get('bvid') || undefined,
                type: url.searchParams.get('type') || undefined
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            let { type } = params.data
            const bvid = params.data.bvid!

            const key = this.CacheKey.videoInfo(bvid)

            let videoInfo = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.Video.VideoInfo>(key), Validation.videoInfoSchema)

            if (!videoInfo) {
                const parser: BiliVideoParser = new BiliVideoParser(ctx)
                videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(bvid), Validation.videoInfoSchema, true)
                await ctx.cache.setCache(key, videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME)
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