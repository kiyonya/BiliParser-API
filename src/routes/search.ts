import z from "zod";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import BiliSearchParser from "../services/search-parser";
import { Config } from "../config";
import { Validation } from "../validation";

type SearchResult = BiliTypes.RES.Search.SearchLiveItem | BiliTypes.RES.Search.SearchUserItem | BiliTypes.RES.Search.SearchVideoItem

export class SearchRoute extends APIRoute {

    private readonly paramsSchema = z.object({
        keyword: z.string().transform(i => i.trim()),
        type: z.enum(['video', 'up', 'live']).default("video"),
        page: z.coerce.number().default(1).transform(p => p === 0 ? 1 : p),
        pageSize: z.coerce.number().default(20),
        order: z.string().optional()
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = await this.paramsSchema.safeParse({
                keyword: url.searchParams.get("keyword") || undefined,
                type: ctx.req.param("type") || url.searchParams.get("type") || undefined,
                page: url.searchParams.get("page") || undefined,
                pageSize: url.searchParams.get("pageSize") || undefined,
                order: url.searchParams.get("order") || undefined
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, keyword, page, pageSize, order } = params.data

            const key = this.CacheKey.search(keyword, type, page, pageSize, order)

            let searchResult = await this.getSchemaValidData(await ctx.cache.getCache<SearchResult>(key), Validation.searchResultSchema)

            if (!searchResult) {
                const parser = new BiliSearchParser(ctx)

                searchResult = await this.getSchemaValidData(await parser.search(keyword, type as any, page, pageSize, order), Validation.searchResultSchema, true)

                await ctx.cache.setCache(key, searchResult, () => this.nowS + Config.BILI_SEARCH_CACHE_TIME)
            }
            return ctx.jsonResp('ok', 200, searchResult)

        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}