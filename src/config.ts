import z from "zod"
import { BiliTypes } from "./types"

export interface CDNStrategy {
    continent: ContinentCode | '*', area: Iso3166Alpha2Code | '*', cdn: keyof BiliTypes.BiliVideoCDN, priority: number
}

const numberEnv = (def: number) => z.coerce.number().default(def)
const stringEnv = z.coerce.string().optional()
const booleanEnv = (raw: string | undefined, def: boolean): boolean =>
    raw ? raw === "true" : def

export abstract class Config {

    public static get isServerLogin(){
        return this.ENABLE_CUSTOM_COOKIES && process.env.CONFIG_CustomCookies !== undefined
    }

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
    public static get VIDEO_CDN_STRATEGE(): CDNStrategy[] {
        return this.parseCDNStrategy(process.env.CONFIG_VideoCDNStrategy ?? "AS,CN,alib;*,*,aliov")
    }

    //cache
    public static get ENABLE_CAHCE_DATA_VALIDATION(): boolean {
        return booleanEnv(process.env.CONFIG_CacheValidation, true)
    }
    
    //cookies
    public static get ENABLE_CUSTOM_COOKIES(): boolean {
        return booleanEnv(process.env.CONFIG_EnableCustomCookies, false)
    }

    //video
    public static get BILI_VIDEO_PLAYURL_CACHE_TIME(): number {
        return numberEnv(5400).safeParse(process.env.CONFIG_BiliVideoPlayUrlCacheTime).data ?? 5400
    }

    public static get BILI_VIDEO_INFO_CAHCE_TIME(): number {
        return numberEnv(60 * 60 * 24).safeParse(process.env.CONFIG_BiliVideoInfoCacheTime).data ?? 60 * 60 * 24
    }

    public static get BILI_VIDEO_SUBTITLES_CACHE_TIME(): number {
        return numberEnv(1800).safeParse(process.env.CONFIG_BiliVideoSubtitlesCacheTime).data ?? 1800
    }

    //live
    public static get BILI_LIVE_CACHE_TIME(): number {
        return numberEnv(60).safeParse(process.env.CONFIG_BiliLiveCacheTime).data ?? 60
    }

    //bangumi
    public static get BILI_BANGUMI_PLAYUEL_CACHE_TIME(): number {
        return numberEnv(5400).safeParse(process.env.CONFIG_BiliBangumiPlayUrlCacheTime).data ?? 5400
    }

    public static get BILI_BANGUMI_EPISODES_CACHE_TIME(): number {
        return numberEnv(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiEpisodesCacheTime).data ?? 60 * 60 * 24 * 7
    }

    public static get BILI_BANGUMI_INFO_CACHE_TIME(): number {
        return numberEnv(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiInfoCacheTime).data ?? 60 * 60 * 24 * 7
    }

    //archieve
    public static get BILI_USER_ARCHIEVE_CACHE_TIME(): number {
        return numberEnv(86400).safeParse(process.env.CONFIG_UGCSeasonArchieveCacheTime).data ?? 86400
    }

    //danmaku
    public static get BILI_DANMAKU_CACHE_TIME(): number {
        return numberEnv(1800).safeParse(process.env.CONFIG_BiliDanmakuCacheTime).data ?? 1800
    }

    //proxy
    public static get ENABLE_PROXY_SERVER(): boolean {
        return booleanEnv(process.env.CONFIG_UseProxyFetch, true)
    }

    public static get PROXY_SERVER_FETCH_MAX_RETRIES(): number {
        return numberEnv(3).safeParse(process.env.CONFIG_ProxyFetchMaxRetries).data ?? 3
    }

    public static get PROXY_SERVER_TIMEOUT(): number {
        return numberEnv(10 * 1000).safeParse(process.env.CONFIG_ProxyFetchTimeout).data ?? 10 * 1000
    }

    public static get PROXY_SERVER_URL(): string | undefined {
        return stringEnv.safeParse(process.env.CONFIG_ProxyServerUrl).data
    }

    public static get PROXY_SERVER_TOKEN(): string | undefined {
        return stringEnv.safeParse(process.env.CONFIG_ProxyToken).data
    }
}