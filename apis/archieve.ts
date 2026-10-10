import z from "zod";
import BiliUserParser from "../services/user-parser";
import { API, BadRequestError } from "./api";
import { AppContext } from "../types/app";
import { BiliTypes } from "../types/bili";
import { Schema } from "../shared/schema";

export class ArchieveAPI extends API {

    private readonly paramSchema = z.object({
        mid: z.coerce.number(),
        seasonId: z.coerce.number(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(30)
    })

    public override async handler(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const params = this.paramSchema.safeParse({
            mid: ctx.req.param('mid') || url.searchParams.get('mid') || undefined,
            seasonId: ctx.req.param('sid') || url.searchParams.get('sid') || undefined,
            page: url.searchParams.get('page') || undefined,
            pageSize: url.searchParams.get('pageSize') || undefined
        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }

        const { mid, seasonId, page, pageSize } = params.data

        const resultCacheKey = ctx.appCacheKey.userArchieves(mid, seasonId, page, pageSize)
        let result = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.User.UserArchieves>(resultCacheKey), Schema.userArchievesSchema)
        if (!result) {
            const parser: BiliUserParser = new BiliUserParser(ctx)
            result = await this.getSchemaValidData(await parser.getUserSeasonArchieves(mid, seasonId, false, page, pageSize), Schema.userArchievesSchema, true)
            await ctx.appCache.setCache(resultCacheKey, result, this.nowS + ctx.config.BILI_USER_ARCHIVE_CACHE_TIME)
        }
        return ctx.jsonResp('Success', 200, result)
    }
}