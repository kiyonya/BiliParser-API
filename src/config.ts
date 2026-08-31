import z from "zod"
import { BiliTypes } from "./types"

export interface CDNStrategy {
    continent: ContinentCode | '*', area: Iso3166Alpha2Code | '*', cdn: keyof BiliTypes.BiliVideoCDN, priority: number
}

export abstract class Config {

    protected static parseCDNStrategy(strategies?: string): CDNStrategy[] {
        const raw = strategies?.trim()
        if (!raw) { return [] }
        return raw.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
            const [continent, area, cdn] = entry.split(',').map(v => v.trim())
            let priority = 2
            if (area === '*') {
                priority--
            }
            if (continent === '*') {
                priority--
            }
            return {
                continent: continent as ContinentCode | '*',
                area: area as Iso3166Alpha2Code | '*',
                cdn: cdn as keyof BiliTypes.BiliVideoCDN,
                priority: priority as number
            }
        }).filter(s => s.continent && s.area && s.cdn).sort((a, b) => b.priority - a.priority)
    }

    //cdn
    public static readonly VideoCDNStrategy: CDNStrategy[] = this.parseCDNStrategy(process.env.CONFIG_VideoCDNStrategy ?? "AS,CN,alib;*,*,aliov") ?? []

    //cache
    public static EnableCacheDataValidation: boolean = process.env.CONFIG_CacheValidation ? process.env.CONFIG_CacheValidation === "true" : true
    
    //cookies
    public static EnableCustomCookies = process.env.CONFIG_EnableCustomCookies ? process.env.CONFIG_EnableCustomCookies === "true" : false

    //video
    public static readonly BiliVideoPlayUrlCacheTime: number = z.coerce.number().default(5400).safeParse(process.env.CONFIG_BiliVideoPlayUrlCacheTime).data ?? 5400

    public static readonly BiliVideoInfoCacheTime: number = z.coerce.number().default(60 * 60 * 24).safeParse(process.env.CONFIG_BiliVideoInfoCacheTime).data ?? 60 * 60 * 24

    public static readonly BiliVideoSubtitlesCacheTime:number = z.coerce.number().default(1800).safeParse(process.env.CONFIG_BiliVideoSubtitlesCacheTime).data ?? 1800

    //live
    public static readonly BiliLiveCacheTime: number = z.coerce.number().default(60).safeParse(process.env.CONFIG_BiliLiveCacheTime).data ?? 60

    //bangumi
    public static readonly BiliBangumiPlayUrlCacheTime: number = z.coerce.number().default(5400).safeParse(process.env.CONFIG_BiliBangumiPlayUrlCacheTime).data ?? 5400

    public static readonly BiliBangumiEpisodesCacheTime: number = z.coerce.number().default(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiEpisodesCacheTime).data ?? 60 * 60 * 24 * 7

    public static readonly BiliBangumiInfoCacheTime: number = z.coerce.number().default(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiInfoCacheTime).data ?? 60 * 60 * 24 * 7

    //archieve
    public static readonly UGCSeasonArchieveCacheTime: number = z.coerce.number().default(86400).safeParse(process.env.CONFIG_UGCSeasonArchieveCacheTime).data ?? 86400

    //danmaku
    public static readonly BiliDanmakuCacheTime: number = z.coerce.number().default(1800).safeParse(process.env.CONFIG_BiliDanmakuCacheTime).data ?? 1800

    //proxy
    public static readonly UseProxyFetch = process.env.CONFIG_UseProxyFetch ? process.env.CONFIG_UseProxyFetch === "true" : true

    public static readonly ProxyFetchMaxRetries: number = z.coerce.number().default(3).safeParse(process.env.CONFIG_ProxyFetchMaxRetries).data ?? 3

    public static readonly ProxyFetchTimeout = z.coerce.number().default(10 * 1000).safeParse(process.env.CONFIG_ProxyFetchTimeout).data ?? 10 * 1000

    public static readonly ProxyServerUrl?:string = z.coerce.string().optional().safeParse(process.env.CONFIG_ProxyServerUrl).data

    public static readonly ProxyToken?:string=z.coerce.string().optional().safeParse(process.env.CONFIG_ProxyToken).data
}