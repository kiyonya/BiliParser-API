import z from "zod";
import BiliBangumiParser from "../services/bangumi-parser";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { Config } from "../config";

export type BangumiIdType = 'ssid' | 'mdid' | 'epid'

export class BiliBangumiInfoRoute extends APIRoute {

    private readonly PARAMS = z.object({
        ssid: z.string().optional(),
        mdid: z.string().optional(),
        epid: z.string().optional()
    })

    private createInfoCacheKey(id: number, idType: BangumiIdType) {
        return `bangumiinfo_${idType}_${id}`
    }

    public override async handle(ctx: AppContext) {

        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
                epid: url.searchParams.get('epid')?.replace('ep', '') || undefined

            })
            if (!params.success) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
            const { ssid, mdid, epid } = params.data

            let id: number
            let type: BangumiIdType
            if (ssid) {
                id = parseInt(ssid)
                type = 'ssid'
            }
            else if (mdid) {
                id = parseInt(mdid)
                type = 'mdid'
            }
            else if (epid) {
                id = parseInt(epid)
                type = 'epid'
            }
            else {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }

            const key = this.createInfoCacheKey(id, type)
            let result = await this.getCache<BiliTypes.RES.Bangumi.BangumiInfo>(ctx, key, Validation.validBangumiInfo)
            if (!result) {
                const parser = new BiliBangumiParser()
                result = await parser.getBangumiInfo(id, type)
                await this.setCache(ctx, key, result, this.nowS + Config.BiliBangumiInfoCacheTime, Validation.validBangumiInfo)
            }
            return this.jsonResponse(ctx, 'Success', 200, result)

        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}

export class BiliBangumiEpisodesRoute extends APIRoute {

    private PARAMS = z.object({
        ssid: z.string().optional(),
        mdid: z.string().optional()
    })

    private createEpisodesCacheKey(id: number, idType: Omit<BangumiIdType, 'epid'>) {
        return `bangumiep_${idType}_${id}`
    }

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss', '') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md', '') || undefined,
            })
            if (!params.success) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
            const { ssid, mdid } = params.data
            let id: number
            let type: Omit<BangumiIdType, 'epid'>
            if (ssid) {
                id = parseInt(ssid)
                type = 'ssid'
            }
            else if (mdid) {
                id = parseInt(mdid)
                type = 'mdid'

            }
            else {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
            this.resHeaders.set('X-Bangumi-Id-Type', type as string)

            const key = this.createEpisodesCacheKey(id, type)
            let result = await this.getCache<BiliTypes.RES.Bangumi.BangumiEpisode>(ctx, key, Validation.validBangumiEpisode)
            if (!result) {
                const parser = new BiliBangumiParser()
                result = await parser.getBangumiEpisodes(id, type as 'mdid' | 'ssid')
                await this.setCache(ctx, key, result, this.nowS + Config.BiliBangumiEpisodesCacheTime, Validation.validBangumiEpisode)
            }

            return this.jsonResponse(ctx, 'Success', 200, result)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}

export class BiliBangumiPlayRoute extends APIRoute {

    private PARAMS = z.object({
        epid: z.coerce.number(),
        type: z.enum(['video', 'json']).default('video'),
        qn: z.coerce.number().pipe(z.literal(64)).default(64),
        cdn: z.enum(Object.keys(this.CDNS)).default('ali')
    })

    private createBangumiPlayUrlCacheKey(epid: number, qn: number) {
        return `bangumiurl_${epid}_${qn}`
    }

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const params = this.PARAMS.safeParse({
                epid: ctx.req.param('epid')?.replaceAll('ep', '') || url.searchParams.get('epid')?.replaceAll('ep', '') || undefined,
                type: url.searchParams.get('type') || undefined,
                qn: url.searchParams.get('qn') || undefined,
                cdn: url.searchParams.get('cdn') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
            let { epid, type, qn, cdn } = params.data

            if (!epid) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }

            const key = this.createBangumiPlayUrlCacheKey(epid, qn)
            let bangumi = await this.getCache<BiliTypes.RES.Bangumi.BangumiPlayURL>(ctx, key, Validation.validBangumiPlayUrl)
            if (!bangumi) {
                const parser = new BiliBangumiParser()
                bangumi = await parser.getBangumiPlayUrl(epid, qn)
                const realQn = bangumi.quality
                const setCacheKey = this.createBangumiPlayUrlCacheKey(epid, realQn)
                await this.setCache(ctx, setCacheKey, bangumi, (data) => {
                    const videoDuration = data.duration
                    let videoBufferTimeS: number
                    if (videoDuration < 60 * 10) {
                        videoBufferTimeS = 60
                    }
                    else if (videoDuration < 3600) {
                        videoBufferTimeS = Math.min(videoDuration * 0.1, 10 * 60)
                    }
                    else {
                        videoBufferTimeS = Math.min(videoDuration * 0.05, 20 * 60)
                    }
                    const videoExpirationS = data.urlExpirationAt - videoBufferTimeS
                    const userExpirationS = Math.floor(Date.now() / 1000) + Config.BiliBangumiPlayUrlCacheTime
                    return Math.min(videoExpirationS, userExpirationS)
                }, Validation.validBangumiPlayUrl)
            }
            bangumi.url = this.autoSwitchBiliCdn(ctx, bangumi.url, cdn as any)
            switch (type) {
                case "video":
                    const url = bangumi.url
                    return ctx.redirect(`/pplay?url=${url}`, 307)
                case "json":
                    return this.jsonResponse(ctx, 'Success', 200, bangumi)
            }

        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}