import z from "zod";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import BiliUserParser from "../services/user-parser";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliArchieveRoute extends APIRoute {

    private readonly PARAMS = z.object({
        mid: z.coerce.number(),
        seasonId: z.coerce.number(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(30)
    })

    public override async Ihandle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                mid: ctx.req.param('mid') || url.searchParams.get('mid') || undefined,
                seasonId: ctx.req.param('sid') || url.searchParams.get('sid') || undefined,
                page: url.searchParams.get('page') || undefined,
                pageSize: url.searchParams.get('pageSize') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, params.error.issues[0]?.message ?? "invalid params", 400, null)
            }

            const { mid, seasonId, page, pageSize } = params.data

            const resultCacheKey = this.CacheKey.userArchieves(mid, seasonId, page, pageSize)
            let result = await this.cache?.getCache<BiliTypes.RES.User.UserArchieves>(resultCacheKey, Validation.userArchievesSchema)
            if (!result) {
                const parser: BiliUserParser = new BiliUserParser(this)
                result = await parser.getUserSeasonArchieves(mid, seasonId, false, page, pageSize)
                await this.cache?.setCache(resultCacheKey, result, this.nowS + Config.BILI_USER_ARCHIEVE_CACHE_TIME, Validation.userArchievesSchema)
            }
            return this.jsonResponse(ctx, 'Success', 200, result, Validation.userArchievesSchema)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }

    }
}