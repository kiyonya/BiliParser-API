import z from "zod";
import { AppContext, BiliTypes } from "../types";
import Route from "../utils/api-route";
import BiliUserParser from "../services/user-parser";
import { Schema } from "../shared/schema";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliFavListRoute extends Route {

    private readonly paramSchema = z.object({
        fid: z.coerce.number(),
        keyword: z.string().optional().transform(o => o?.trim()),
        page: z.coerce.number().default(1).transform(p => p === 0 ? 1 : p),
        pageSize: z.coerce.number().default(40)
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = this.paramSchema.safeParse({
                fid: ctx.req.param('fid') || url.searchParams.get('fid') || undefined,
                keyword: url.searchParams.get('keyword') || undefined,
                page: url.searchParams.get('page') || undefined,
                pageSize: url.searchParams.get('pageSize') || undefined
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }

            const { fid, keyword, page, pageSize } = params.data

            const resultCacheKey = SharedData.cacheKey.userFav(fid, keyword, page, pageSize)
            let result = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.User.UserFav>(resultCacheKey), Schema.userFavSchema)
            if (!result) {
                const parser: BiliUserParser = new BiliUserParser(ctx)
                result = await this.getSchemaValidData(await parser.getUserFavList(fid, keyword, page, pageSize), Schema.userFavSchema, true)
                await ctx.cache.setCache(resultCacheKey, result, this.nowS + Config.BILI_USER_FAV_CACHE_TIME)
            }
            return ctx.jsonResp('Success', 200, result)
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}
