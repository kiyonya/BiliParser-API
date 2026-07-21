import z from "zod";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import BiliUserParser from "../services/user-parser";

export class BiliArchieveRoute extends APIRoute {

    private BILI_UGCSEASON_ARCHIEVE_CACHE_TIME = 86400

    private readonly PARAMS = z.object({
        mid: z.coerce.number(),
        seasonId: z.coerce.number(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(30)
    })

    private createArchieveCacheKey(mid: number, seasonId: number, p: number, ps: number) {
        return `ugcseasonarch_${mid}_${seasonId}_${p}_${ps}`
    }

    public override async handle(ctx: AppContext) {
        try {
            await this.checkRateLimit(ctx)
            const url = new URL(ctx.req.url)

            const params = this.PARAMS.safeParse({
                mid: ctx.req.param('mid') || url.searchParams.get('mid') || undefined,
                seasonId: ctx.req.param('sid') || url.searchParams.get('sid') || undefined,
                page: url.searchParams.get('page') || undefined,
                pageSize: url.searchParams.get('pageSize') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }

            const { mid, seasonId, page, pageSize } = params.data

            const resultCacheKey = this.createArchieveCacheKey(mid, seasonId, page, pageSize)
            let result = await this.getCache<BiliTypes.RES.User.UserArchieves>(ctx, resultCacheKey)
            if (!result) {
                const parser = new BiliUserParser()
                result = await parser.getUserSeasonArchieves(mid, seasonId, false, page, pageSize)
                await this.setCache(ctx, resultCacheKey, result, this.nowS + this.BILI_UGCSEASON_ARCHIEVE_CACHE_TIME)
            }
            return this.jsonResponse(ctx, 'Success', 200, result)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }

    }
}