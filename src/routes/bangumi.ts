import z from "zod";
import BiliBangumiParser from "../services/bangumi-parser";
import { AppContext, BiliTypes } from "../types";
import Route from "../utils/api-route";
import { Schema } from "../shared/schema";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliBangumiInfoRoute extends Route {

    private readonly paramSchema = z.object({
        ssid: z.coerce.number().optional(),
        mdid: z.coerce.number().optional(),
        epid: z.coerce.number().optional()
    }).transform((args) => {
        return {
            ...args,
            seasonId: args.ssid || args.mdid,
            episodeId: args.epid
        }
    }).superRefine((args, ctx) => {
        if (!args.seasonId && !args.episodeId) {
            ctx.addIssue("cannot find id to parse")
        }
    })

    public override async handle(ctx: AppContext) {

        try {
            const url = new URL(ctx.req.url)
            const params = this.paramSchema.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
                epid: url.searchParams.get('epid')?.replace('ep', '') || undefined

            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { seasonId, episodeId } = params.data

            const key = SharedData.cacheKey.bangumiInfo(seasonId, episodeId)
            let result = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.Bangumi.BangumiInfo>(key), Schema.bangumiInfoSchema)
            if (!result) {
                const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
                result = await this.getSchemaValidData(await parser.getBangumiInfo(seasonId, episodeId), Schema.bangumiInfoSchema, true)
                await ctx.cache.setCache(key, result, this.nowS + Config.BILI_BANGUMI_INFO_CACHE_TIME)
            }
            return ctx.jsonResp('Success', 200, result)

        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}

export class BiliBangumiEpisodesRoute extends Route {

    protected readonly paramSchema = z.object({
        ssid: z.coerce.number().optional(),
        mdid: z.coerce.number().optional()
    }).transform((args) => {
        return {
            ...args,
            seasonId: args.ssid || args.mdid
        }
    }).superRefine((args, ctx) => {
        if (!args.seasonId) {
            ctx.addIssue("cannot find id to parse")
        }
    })

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = this.paramSchema.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { seasonId } = params.data
            const key = SharedData.cacheKey.bangumiEpisodes(seasonId)
            let result = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.Bangumi.BangumiEpisode>(key), Schema.bangumiEpisodeSchema)
            if (!result) {
                const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
                result = await this.getSchemaValidData(await parser.getBangumiEpisodes(seasonId), Schema.bangumiEpisodeSchema, true)
                await ctx.cache.setCache(key, result, this.nowS + Config.BILI_BANGUMI_EPISODES_CACHE_TIME)
            }

            return ctx.jsonResp('Success', 200, result)
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}
