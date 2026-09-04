import z from "zod";
import BiliBangumiParser from "../services/bangumi-parser";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export class BiliBangumiInfoRoute extends APIRoute {

    private readonly PARAMS = z.object({
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

    public override async invoke(ctx: AppContext) {

        try {
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
                epid: url.searchParams.get('epid')?.replace('ep', '') || undefined

            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { seasonId, episodeId } = params.data

            const key = this.CacheKey.bangumiInfo(seasonId, episodeId)
            let result = await ctx.cache.getCache<BiliTypes.RES.Bangumi.BangumiInfo>(key, Validation.bangumiInfoSchema)
            if (!result) {
                const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
                result = await parser.getBangumiInfo(seasonId, episodeId)
                await ctx.cache.setCache(key, result, this.nowS + Config.BILI_BANGUMI_INFO_CACHE_TIME, Validation.bangumiInfoSchema)
            }
            return ctx.jsonResp('Success', 200, result, Validation.bangumiInfoSchema)

        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}

export class BiliBangumiEpisodesRoute extends APIRoute {

    private PARAMS = z.object({
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

    public override async invoke(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
            })
            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { seasonId } = params.data
            const key = this.CacheKey.bangumiEpisodes(seasonId)
            let result = await ctx.cache.getCache<BiliTypes.RES.Bangumi.BangumiEpisode>(key, Validation.bangumiEpisodeSchema)
            if (!result) {
                const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
                result = await parser.getBangumiEpisodes(seasonId)
                await ctx.cache.setCache(key, result, this.nowS + Config.BILI_BANGUMI_EPISODES_CACHE_TIME, Validation.bangumiEpisodeSchema)
            }

            return ctx.jsonResp('Success', 200, result, Validation.bangumiEpisodeSchema)
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}
