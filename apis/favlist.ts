import z from "zod";
import BiliUserParser from "../services/user-parser";
import { API, BadRequestError } from "./api";
import { AppContext } from "../types/app";
import { BiliTypes } from "../types/bili";
import { Schema } from "../shared/schema";

export class FavListAPI extends API {

    private readonly paramSchema = z.object({
        fid: z.coerce.number(),
        keyword: z.string().optional().transform(o => o?.trim()),
        page: z.coerce.number().default(1).transform(p => p === 0 ? 1 : p),
        pageSize: z.coerce.number().default(40)
    })

    public override async handler(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const params = this.paramSchema.safeParse({
            fid: ctx.req.param('fid') || url.searchParams.get('fid') || undefined,
            keyword: url.searchParams.get('keyword') || undefined,
            page: url.searchParams.get('page') || undefined,
            pageSize: url.searchParams.get('pageSize') || undefined
        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }

        const { fid, keyword, page, pageSize } = params.data

        const resultCacheKey = ctx.appCacheKey.userFav(fid, keyword, page, pageSize)
        let result = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.User.UserFav>(resultCacheKey), Schema.userFavSchema)
        if (!result) {
            const parser: BiliUserParser = new BiliUserParser(ctx)
            result = await this.getSchemaValidData(await parser.getUserFavList(fid, keyword, page, pageSize), Schema.userFavSchema, true)
            await ctx.appCache.setCache(resultCacheKey, result, this.nowS + ctx.config.BILI_USER_FAV_CACHE_TIME)
        }
        return ctx.jsonResp('Success', 200, result)
    }
}
