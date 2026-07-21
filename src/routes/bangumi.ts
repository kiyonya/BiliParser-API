import z from "zod";
import BiliBangumiParser from "../services/bangumi-parser";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";

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
            await this.checkRateLimit(ctx)
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss','') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md','') || undefined,
                epid: url.searchParams.get('epid')?.replace('ep','') || undefined

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
            let result = await this.getCache<BiliTypes.RES.Bangumi.BangumiInfo>(ctx, key)
            if (!result) {
                const parser = new BiliBangumiParser()
                result = await parser.getBangumiInfo(id, type)
                await this.setCache(ctx, key, result, this.nowS + this.BILI_BANGUMI_INFO_CACHE_TIME)
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
            await this.checkRateLimit(ctx)
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                ssid: url.searchParams.get('ssid')?.replace('ss','') || undefined,
                mdid: url.searchParams.get('mdid')?.replace('md','') || undefined,
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
            let result = await this.getCache<BiliTypes.RES.Bangumi.BangumiEpisode>(ctx, key)
            if (!result) {
                const parser = new BiliBangumiParser()
                result = await parser.getBangumiEpisodes(id, type as 'mdid' | 'ssid')
                await this.setCache(ctx, key, result, this.nowS + this.BILI_BANGUMI_EPISODES_CACHE_TIME)
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

    private autoSwitchBangumiCdn(ctx: AppContext, bangumi: BiliTypes.RES.Bangumi.BangumiPlayURL, cdn?: keyof BiliTypes.BiliVideoCDN): BiliTypes.RES.Bangumi.BangumiPlayURL {
        const cf = ctx.req.raw.cf
        let cdnHostname: string
        if (cdn && this.CDNS[cdn]) {
            cdnHostname = this.CDNS[cdn]
            this.resHeaders.set('X-Bili-CDN', cdn)
        }
        else {
            const isChinaRegion = cf?.continent === 'AS' && cf.country === "CN"
            if (isChinaRegion) {
                cdnHostname = this.CDNS[this.BILI_VIDEO_CNCDN]
                this.resHeaders.set('X-Bili-CDN', this.BILI_VIDEO_CNCDN)
            }
            else {
                cdnHostname = this.CDNS[this.BILI_VIDEO_OVCDN]
                this.resHeaders.set('X-Bili-CDN', this.BILI_VIDEO_OVCDN)
            }
        }
        if (cdnHostname) {
            const mainUrl = new URL(bangumi.url)
            mainUrl.hostname = cdnHostname
            bangumi.url = mainUrl.toString()
            bangumi.backups.forEach(backupUrlString => {
                const backupUrl = new URL(backupUrlString)
                backupUrl.hostname = cdnHostname
                return backupUrl.toString()
            })
        }
        return bangumi
    }

    public override async handle(ctx: AppContext) {
        try {
            await this.checkRateLimit(ctx)
            const url = new URL(ctx.req.url)

            const params = this.PARAMS.safeParse({
                epid: ctx.req.param('epid')?.replaceAll('ep','') || url.searchParams.get('epid')?.replaceAll('ep','') || undefined,
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
            let bangumi = await this.getCache<BiliTypes.RES.Bangumi.BangumiPlayURL>(ctx, key)
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
                    const userExpirationS = Math.floor(Date.now() / 1000) + this.BILI_BANGUMI_PLAYURL_CACHE_TIME
                    return Math.min(videoExpirationS, userExpirationS)
                })
            }

            bangumi = this.autoSwitchBangumiCdn(ctx, bangumi, cdn as any)

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