import { md5String } from "../utils/hashlib"
import { parseCDN, parseCDNAllocation } from "./cdn"
import { CDNAllocation } from "../types/app"

const bool = (raw: unknown, def?: boolean): boolean | undefined => {
    if (raw === true || raw === "true") return true
    if (raw === false || raw === "false") return false
    return def
}

function str(raw: unknown): string | undefined
function str(raw: unknown, def: string): string
function str(raw: unknown, def?: string): string | undefined {
    if (raw === undefined || raw === null || raw === "") return def
    return String(raw)
}

const num = (raw: unknown, def?: number): number | undefined => {
    if (raw === undefined || raw === null || raw === "") return def
    const value = Number(raw)
    return Number.isFinite(value) ? value : def
}

export class AppConfig {

    private readonly memoCache = new Map<string, unknown>()
    protected memo<T>(key: string, compute: () => T): T {
        if (!this.memoCache.has(key)) {
            this.memoCache.set(key, compute())
        }
        return this.memoCache.get(key) as T
    }
    private env: Record<any, any>
    constructor(env:Record<any, string>) {
        this.env = env
    }

    protected bool(value: any, def: boolean): boolean | undefined {
        if (typeof value === 'boolean') { return value }
        if (typeof value === 'string') {
            if (value === 'true') { return true }
            if (value === 'false') { return false }
        }
        return def !== undefined ? def : undefined
    }


    protected readonly DEFAULT_CDN_ALLOCATION = "AS,CN,alib;*,*,aliov"
    protected readonly DEFAULT_CDN = `
    ali,upos-sz-mirrorali.bilivideo.com;
    aliov,upos-sz-mirroraliov.bilivideo.com;
    alib,upos-sz-mirroralib.bilivideo.com;
    alio1,upos-sz-mirroralio1.bilivideo.com;
    ali02,upos-sz-mirrorali02.bilivideo.com;
    cos,upos-sz-mirrorcos.bilivideo.com;
    cosb,upos-sz-mirrorcosb.bilivideo.com;
    coso1,upos-sz-mirrorcoso1.bilivideo.com;
    cosov,upos-sz-mirrorcosov.bilivideo.com;
    cosdisp,upos-sz-mirrorcosdisp.bilivideo.com;
    hw,upos-sz-mirrorhw.bilivideo.com;
    hwb,upos-sz-mirrorhwb.bilivideo.com;
    hwo1,upos-sz-mirrorhwo1.bilivideo.com;
    hwdisp,upos-sz-mirrorhwdisp.bilivideo.com;
    bd,upos-sz-mirrorbd.bilivideo.com;
    m08c,upos-sz-mirror08c.bilivideo.com;
    m08h,upos-sz-mirror08h.bilivideo.com;
    m08ct,upos-sz-mirror08ct.bilivideo.com;
    estgcos,upos-sz-estgcos.bilivideo.com;
    estgoss,upos-sz-estgoss.bilivideo.com;
    estghw,upos-sz-estghw.bilivideo.com;
    upcdnbda2,upos-sz-upcdnbda2.bilivideo.com;
    rali,upos-sz-mirrorrali.bilivideo.com;
    akam,upos-hz-mirrorakam.akamaized.net`

    public get SERVER_VERSION() {
        return str(this.env.SERVER_VERSION)
    }

    public get IS_SERVER_LOGIN() {
        return this.memo("isServerLogin", () => this.ENABLE_CUSTOM_COOKIES && this.env.CONFIG_CustomCookies !== undefined)
    }

    public get SERVER_LOGIN_HASHKEY() {
        return this.memo("serverLoginKeyHash", () => {
            const key = `${String(this.IS_SERVER_LOGIN)}:${this.env.CONFIG_CustomCookies ?? ""}`
            return md5String(key)
        })
    }

    //cdn
    public get VIDEO_CDN_ALLOCATION(): CDNAllocation[] {
        return this.memo("VIDEO_CDN_ALLOCATION", () => parseCDNAllocation(this.env.CONFIG_VideoCDNAllocation ?? this.DEFAULT_CDN_ALLOCATION)) || []
    }

    public get VIDEO_CDN(): Record<string, string> {
        return this.memo('VIDEO_CDN', () => parseCDN(this.env.CONFIG_VideoCDN ?? this.DEFAULT_CDN)) || {}
    }

    //cache
    public get ENABLE_CAHCE_DATA_VALIDATION(): boolean {
        return this.memo("ENABLE_CAHCE_DATA_VALIDATION", () => bool(this.env.CONFIG_CacheValidation, true))!
    }

    public get CACHE_DATA_VERSION(): number {
        return this.memo("CACHE_DATA_VERSION", () => num(this.env.CONFIG_CacheDataVersion, 5))!
    }

    public get RESPONSE_WORKER_CACHING(): boolean {
        return this.memo("RESPONSE_WORKER_CACHING", () => bool(this.env.CONFIG_ResponseWorkerCaching, true))!
    }

    public get RESPONSE_MAX_CACHE_TIME(): number {
        return this.memo('RESPONSE_MAX_CACHE_TIME', () => num(this.env.CONFIG_ResponseMaxCacheTime, 3600))!
    }

    public get KV_CACHE_BINGDING(): string | undefined {
        return this.memo("KV_CACHE_BINDING", () => str(this.env.CONFIG_KVCacheBinding))
    }

    //cookies
    public get ENABLE_CUSTOM_COOKIES(): boolean {
        return this.memo("ENABLE_CUSTOM_COOKIES", () => bool(this.env.CONFIG_EnableCustomCookies, false))!
    }

    public get COOKIES_SIGN_CACHE_TIME(): number {
        return this.memo("COOKIES_SIGN_CACHE_TIME", () => num(this.env.CONFIG_CookiesSignCacheTime, 3600))!
    }

    //video
    public get BILI_VIDEO_PLAYURL_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_PLAYURL_CACHE_TIME", () => num(this.env.CONFIG_BiliVideoPlayUrlCacheTime, 5400))!
    }

    public get BILI_VIDEO_INFO_CAHCE_TIME(): number {
        return this.memo("BILI_VIDEO_INFO_CAHCE_TIME", () => num(this.env.CONFIG_BiliVideoInfoCacheTime, 60 * 60 * 24))!
    }

    public get BILI_VIDEO_SUBTITLES_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_SUBTITLES_CACHE_TIME", () => num(this.env.CONFIG_BiliVideoSubtitlesCacheTime, 1800))!
    }

    //live
    public get BILI_LIVE_CACHE_TIME(): number {
        return this.memo("BILI_LIVE_CACHE_TIME", () => num(this.env.CONFIG_BiliLiveCacheTime, 60))!
    }

    //bangumi
    public get BILI_BANGUMI_PLAYUEL_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_PLAYUEL_CACHE_TIME", () => num(this.env.CONFIG_BiliBangumiPlayUrlCacheTime, 5400))!
    }

    public get BILI_BANGUMI_EPISODES_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_EPISODES_CACHE_TIME", () => num(this.env.CONFIG_BiliBangumiEpisodesCacheTime, 60 * 60 * 24 * 7))!
    }

    public get BILI_BANGUMI_INFO_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_INFO_CACHE_TIME", () => num(this.env.CONFIG_BiliBangumiInfoCacheTime, 60 * 60 * 24 * 7))!
    }

    //archieve
    public get BILI_USER_ARCHIEVE_CACHE_TIME(): number {
        return this.memo("BILI_USER_ARCHIEVE_CACHE_TIME", () => num(this.env.CONFIG_UGCSeasonArchieveCacheTime, 86400))!
    }

    //favlist
    public get BILI_USER_FAV_CACHE_TIME(): number {
        return this.memo("BILI_USER_FAV_CACHE_TIME", () => num(this.env.CONFIG_BiliUserFavCacheTime, 3600))!
    }

    //danmaku
    public get BILI_DANMAKU_CACHE_TIME(): number {
        return this.memo("BILI_DANMAKU_CACHE_TIME", () => num(this.env.CONFIG_BiliDanmakuCacheTime, 1800))!
    }

    //proxy
    public get ENABLE_PROXY_SERVER(): boolean {
        return this.memo("ENABLE_PROXY_SERVER", () => bool(this.env.CONFIG_UseProxyFetch, true))!
    }

    public get PROXY_SERVER_FETCH_MAX_RETRIES(): number {
        return this.memo("PROXY_SERVER_FETCH_MAX_RETRIES", () => num(this.env.CONFIG_ProxyFetchMaxRetries, 3))!
    }

    public get PROXY_SERVER_TIMEOUT(): number {
        return this.memo("PROXY_SERVER_TIMEOUT", () => num(this.env.CONFIG_ProxyFetchTimeout, 10 * 1000))!
    }

    public get PROXY_SERVER_URL(): string | undefined {
        return this.memo("PROXY_SERVER_URL", () => str(this.env.CONFIG_ProxyServerUrl))
    }

    public get PROXY_SERVER_TOKEN(): string | undefined {
        return this.memo("PROXY_SERVER_TOKEN", () => str(this.env.CONFIG_ProxyToken))
    }

    public get PROXY_TOKEN_HEADER(): string {
        return this.memo("PROXY_TOKEN_HEADER", () => str(this.env.CONFIG_ProxyTokenHeader, "X-Proxy-Token"))
    }

    //search
    public get BILI_SEARCH_CACHE_TIME(): number {
        return this.memo("BILI_SEARCH_CACHE_TIME", () => num(this.env.CONFIG_BiliSearchCacheTime, 360))!
    }
}