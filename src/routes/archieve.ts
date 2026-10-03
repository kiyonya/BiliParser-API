import z from "zod";
import { AppContext, BiliTypes } from "../types";
import Route from "../utils/api-route";
import BiliUserParser from "../services/user-parser";
import { Schema } from "../shared/schema";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliArchieveRoute extends Route {

    private readonly paramSchema = z.object({
        mid: z.coerce.number(),
        seasonId: z.coerce.number(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(30)
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = this.paramSchema.safeParse({
                mid: ctx.req.param('mid') || url.searchParams.get('mid') || undefined,
                seasonId: ctx.req.param('sid') || url.searchParams.get('sid') || undefined,
                page: url.searchParams.get('page') || undefined,
                pageSize: url.searchParams.get('pageSize') || undefined
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }

            const { mid, seasonId, page, pageSize } = params.data

            const resultCacheKey = SharedData.cacheKey.userArchieves(mid, seasonId, page, pageSize)
            let result = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.User.UserArchieves>(resultCacheKey), Schema.userArchievesSchema)
            if (!result) {
                const parser: BiliUserParser = new BiliUserParser(ctx)
                result = await this.getSchemaValidData(await parser.getUserSeasonArchieves(mid, seasonId, false, page, pageSize), Schema.userArchievesSchema, true)
                await ctx.cache.setCache(resultCacheKey, result, this.nowS + Config.BILI_USER_ARCHIEVE_CACHE_TIME)
            }
            return ctx.jsonResp('Success', 200, result)
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }

    }
}