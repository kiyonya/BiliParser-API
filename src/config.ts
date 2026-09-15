import z from "zod"
import { md5String } from "./utils/hashlib"
import { MemoObject } from "./memo"
import { CDNStrategy } from "./types"

const numberEnv = (def: number) => z.coerce.number().default(def)
const stringEnv = z.coerce.string().optional()
const booleanEnv = (raw: string | undefined, def: boolean): boolean =>
    raw ? raw === "true" : def

export abstract class Config extends MemoObject {

    public static parseCDNStrategy(strategies?: string): CDNStrategy[] {
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
                continent: continent as string,
                area: area as string,
                cdn: cdn as string,
                priority: priority as number
            }
        }).filter(s => s.continent && s.area && s.cdn).sort((a, b) => b.priority - a.priority)
    }

    //auth
    public static get IS_SERVER_LOGIN() {
        return this.memo("isServerLogin", () => this.ENABLE_CUSTOM_COOKIES && process.env.CONFIG_CustomCookies !== undefined)
    }

    public static get SERVER_LOGIN_HASHKEY() {
        return this.memo("serverLoginKeyHash", () => {
            const key = `${String(this.IS_SERVER_LOGIN)}:${process.env.CONFIG_CustomCookies ?? ""}`
            return md5String(key)
        })
    }

    //cdn
    public static get VIDEO_CDN_STRATEGE(): CDNStrategy[] {
        return this.memo("VIDEO_CDN_STRATEGE", () => this.parseCDNStrategy(process.env.CONFIG_VideoCDNStrategy ?? "AS,CN,alib;*,*,aliov"))
    }

    //cache
    public static get ENABLE_CAHCE_DATA_VALIDATION(): boolean {
        return this.memo("ENABLE_CAHCE_DATA_VALIDATION", () => booleanEnv(process.env.CONFIG_CacheValidation, true))
    }

    public static get CACHE_DATA_VERSION(): number {
        return this.memo("CACHE_DATA_VERSION", () => numberEnv(5).safeParse(process.env.CONFIG_CacheDataVersion).data ?? 5)
    }

    public static get RESPONSE_CACHE_TIME(): number {
        return this.memo("RESPONSE_CACHE_TIME", () => numberEnv(0).safeParse(process.env.CONFIG_ResponseCacheTime).data ?? 0)
    }

    public static get RESPONSE_CACHE_STALE_WHILE_REVALIDATE(): number {
        return this.memo("RESPONSE_CACHE_STALE_WHILE_REVALIDATE", () => numberEnv(0).safeParse(process.env.CONFIG_ResponseCacheStaleWhileRevalidate).data ?? 0)
    }

    public static get RESPONSE_WORKER_CACHING():boolean {
        return this.memo("RESPONSE_WORKER_CACHING",()=>booleanEnv(process.env.CONFIG_ResponseWorkerCaching,true))
    }

    //cookies
    public static get ENABLE_CUSTOM_COOKIES(): boolean {
        return this.memo("ENABLE_CUSTOM_COOKIES", () => booleanEnv(process.env.CONFIG_EnableCustomCookies, false))
    }

    public static get COOKIES_SIGN_CACHE_TIME(): number {
        return this.memo("COOKIES_SIGN_CACHE_TIME", () => numberEnv(3600).safeParse(process.env.CONFIG_CookiesSignCacheTime).data ?? 3600)
    }

    //video
    public static get BILI_VIDEO_PLAYURL_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_PLAYURL_CACHE_TIME", () => numberEnv(5400).safeParse(process.env.CONFIG_BiliVideoPlayUrlCacheTime).data ?? 5400)
    }

    public static get BILI_VIDEO_INFO_CAHCE_TIME(): number {
        return this.memo("BILI_VIDEO_INFO_CAHCE_TIME", () => numberEnv(60 * 60 * 24).safeParse(process.env.CONFIG_BiliVideoInfoCacheTime).data ?? 60 * 60 * 24)
    }

    public static get BILI_VIDEO_SUBTITLES_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_SUBTITLES_CACHE_TIME", () => numberEnv(1800).safeParse(process.env.CONFIG_BiliVideoSubtitlesCacheTime).data ?? 1800)
    }

    //live
    public static get BILI_LIVE_CACHE_TIME(): number {
        return this.memo("BILI_LIVE_CACHE_TIME", () => numberEnv(60).safeParse(process.env.CONFIG_BiliLiveCacheTime).data ?? 60)
    }

    //bangumi
    public static get BILI_BANGUMI_PLAYUEL_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_PLAYUEL_CACHE_TIME", () => numberEnv(5400).safeParse(process.env.CONFIG_BiliBangumiPlayUrlCacheTime).data ?? 5400)
    }

    public static get BILI_BANGUMI_EPISODES_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_EPISODES_CACHE_TIME", () => numberEnv(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiEpisodesCacheTime).data ?? 60 * 60 * 24 * 7)
    }

    public static get BILI_BANGUMI_INFO_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_INFO_CACHE_TIME", () => numberEnv(60 * 60 * 24 * 7).safeParse(process.env.CONFIG_BiliBangumiInfoCacheTime).data ?? 60 * 60 * 24 * 7)
    }

    //archieve
    public static get BILI_USER_ARCHIEVE_CACHE_TIME(): number {
        return this.memo("BILI_USER_ARCHIEVE_CACHE_TIME", () => numberEnv(86400).safeParse(process.env.CONFIG_UGCSeasonArchieveCacheTime).data ?? 86400)
    }

    //favlist
    public static get BILI_USER_FAV_CACHE_TIME(): number {
        return this.memo("BILI_USER_FAV_CACHE_TIME", () => numberEnv(3600).safeParse(process.env.CONFIG_BiliUserFavCacheTime).data ?? 3600)
    }

    //danmaku
    public static get BILI_DANMAKU_CACHE_TIME(): number {
        return this.memo("BILI_DANMAKU_CACHE_TIME", () => numberEnv(1800).safeParse(process.env.CONFIG_BiliDanmakuCacheTime).data ?? 1800)
    }

    //proxy
    public static get ENABLE_PROXY_SERVER(): boolean {
        return this.memo("ENABLE_PROXY_SERVER", () => booleanEnv(process.env.CONFIG_UseProxyFetch, true))
    }

    public static get PROXY_SERVER_FETCH_MAX_RETRIES(): number {
        return this.memo("PROXY_SERVER_FETCH_MAX_RETRIES", () => numberEnv(3).safeParse(process.env.CONFIG_ProxyFetchMaxRetries).data ?? 3)
    }

    public static get PROXY_SERVER_TIMEOUT(): number {
        return this.memo("PROXY_SERVER_TIMEOUT", () => numberEnv(10 * 1000).safeParse(process.env.CONFIG_ProxyFetchTimeout).data ?? 10 * 1000)
    }

    public static get PROXY_SERVER_URL(): string | undefined {
        return this.memo("PROXY_SERVER_URL", () => stringEnv.safeParse(process.env.CONFIG_ProxyServerUrl).data)
    }

    public static get PROXY_SERVER_TOKEN(): string | undefined {
        return this.memo("PROXY_SERVER_TOKEN", () => stringEnv.safeParse(process.env.CONFIG_ProxyToken).data)
    }

    //search
    public static get BILI_SEARCH_CACHE_TIME(): number {
        return this.memo("BILI_SEARCH_CACHE_TIME", () => numberEnv(360).safeParse(process.env.CONFIG_BiliSearchCacheTime).data ?? 360)
    }
}