import z from "zod";
import BiliSearchParser from "../services/search-parser";
import { API, BadRequestError } from "./api";
import { BiliTypes } from "../types/bili";
import { AppContext } from "../types/app";
import { Schema } from "../shared/schema";

type SearchResult = BiliTypes.RES.Search.SearchLiveItem | BiliTypes.RES.Search.SearchUserItem | BiliTypes.RES.Search.SearchVideoItem

export class SearchAPI extends API {

    private readonly paramSchema = z.object({
        keyword: z.string().transform(i => i.trim()),
        type: z.enum(['video', 'up', 'live']).default("video"),
        page: z.coerce.number().default(1).transform(p => p === 0 ? 1 : p),
        pageSize: z.coerce.number().default(20),
        order: z.string().optional()
    })

    public override async handler(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const params = await this.paramSchema.safeParse({
            keyword: url.searchParams.get("keyword") || undefined,
            type: ctx.req.param("type") || url.searchParams.get("type") || undefined,
            page: url.searchParams.get("page") || undefined,
            pageSize: url.searchParams.get("pageSize") || undefined,
            order: url.searchParams.get("order") || undefined
        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }
        const { type, keyword, page, pageSize, order } = params.data

        const key = ctx.appCacheKey.search(keyword, type, page, pageSize, order)

        let searchResult = await this.getSchemaValidData(await ctx.appCache.getCache<SearchResult>(key), Schema.searchResultSchema)

        if (!searchResult) {
            const parser = new BiliSearchParser(ctx)

            searchResult = await this.getSchemaValidData(await parser.search(keyword, type as any, page, pageSize, order), Schema.searchResultSchema, true)

            await ctx.appCache.setCache(key, searchResult, () => this.nowS + ctx.config.BILI_SEARCH_CACHE_TIME)
        }
        return ctx.jsonResp('ok', 200, searchResult)
    }
}