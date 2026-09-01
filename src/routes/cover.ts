import z from "zod";
import APIRoute from "../utils/api-route";
import { AppContext, BiliTypes } from "../types";
import BiliVideoParser from "../services/video-parser";
import { Config } from "../config";

export class BiliCoverRoute extends APIRoute {

    protected readonly PARAMS = z.object({
        url: z.url().optional(),
        bvid: z.string().optional(),
        type: z.enum(['img', 'url', 'redirect']).default('img').optional()
    }).transform(async (args) => {
        let { bvid, url } = args
        if (url) {
            const processed = await this.getBvParamsFromUrl(url)
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
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: url.pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const params = await this.PARAMS.safeParseAsync({
                url: url.searchParams.get('url') || undefined,
                bvid: ctx.req.param('bvid') || url.searchParams.get('bvid') || undefined,
                type: url.searchParams.get('type') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type } = params.data
            const bvid = params.data.bvid!

            const key = this.CacheKey.videoInfo(bvid)
            let videoInfo = await this.cache.getCache<BiliTypes.RES.Video.VideoInfo>(ctx, key)
            if (!videoInfo) {
                const parser = new BiliVideoParser()
                videoInfo = await parser.getVideoInfo(bvid)
                await this.cache.setCache(ctx, key, videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME)
            }
            const imgUrl = videoInfo.pic
            switch (type) {
                case "url":
                    return ctx.text(imgUrl, 200, { ...this.headers })
                case "img":
                    const proxyHeaders = new Headers()
                    proxyHeaders.set('Referer', this.BILI_REFERER)
                    const imgReq = await fetch(imgUrl, {
                        method: "GET",
                        headers: proxyHeaders
                    })
                    const responseHeaders = new Headers(imgReq.headers)
                    responseHeaders.set('Access-Control-Allow-Origin', '*')
                    responseHeaders.set('Cache-Control', 'max-age=31536000')
                    for (const [k, v] of Object.entries(this.headers)) {
                        responseHeaders.append(k, v)
                    }
                    const response = new Response(imgReq.body, {
                        status: imgReq.status,
                        headers: responseHeaders
                    })
                    return response
                case 'redirect':
                    return ctx.redirect(imgUrl, 302)
            }
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}