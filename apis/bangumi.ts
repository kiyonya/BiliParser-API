import z from "zod";
import BiliBangumiParser from "../services/bangumi-parser";
import { API, BadRequestError } from "./api";
import { AppContext } from "../types/app";
import { BiliTypes } from "../types/bili";
import { Schema } from "../shared/schema";

export class BangumiInfoAPI extends API {

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

    public override async handler(ctx: AppContext) {

        const url = new URL(ctx.req.url)
        const params = this.paramSchema.safeParse({
            ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
            mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
            epid: url.searchParams.get('epid')?.replace('ep', '') || undefined

        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }
        const { seasonId, episodeId } = params.data

        const key = ctx.appCacheKey.bangumiInfo(seasonId, episodeId)
        let result = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.Bangumi.BangumiInfo>(key), Schema.bangumiInfoSchema)
        if (!result) {
            const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
            result = await this.getSchemaValidData(await parser.getBangumiInfo(seasonId, episodeId), Schema.bangumiInfoSchema, true)
            await ctx.appCache.setCache(key, result, this.nowS + ctx.config.BILI_BANGUMI_INFO_CACHE_TIME)
        }
        return ctx.jsonResp('Success', 200, result)

    }
}

export class BangumiEpisodesAPI extends API {

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

    public override async handler(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const params = this.paramSchema.safeParse({
            ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
            mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
        })
        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }
        const { seasonId } = params.data
        const key = ctx.appCacheKey.bangumiEpisodes(seasonId)
        let result = await this.getSchemaValidData(await ctx.appCache.getCache<BiliTypes.RES.Bangumi.BangumiEpisode>(key), Schema.bangumiEpisodeSchema)
        if (!result) {
            const parser: BiliBangumiParser = new BiliBangumiParser(ctx)
            result = await this.getSchemaValidData(await parser.getBangumiEpisodes(seasonId), Schema.bangumiEpisodeSchema, true)
            await ctx.appCache.setCache(key, result, this.nowS + ctx.config.BILI_BANGUMI_EPISODES_CACHE_TIME)
        }

        return ctx.jsonResp('Success', 200, result)
    }
}
