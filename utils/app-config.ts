import { md5String } from "../utils/hashlib"
import { parseCDN, parseCDNAllocation } from "./cdn"
import { AppConfigOptions, CDNAllocation } from "../types/app"

export function bool(raw: unknown): boolean | undefined
export function bool(raw: unknown, def: boolean): boolean
export function bool(raw: unknown, def?: boolean): boolean | undefined {
    if (raw === true || raw === "true") return true
    if (raw === false || raw === "false") return false
    return def
}

export function str(raw: unknown): string | undefined
export function str(raw: unknown, def: string): string
export function str(raw: unknown, def?: string): string | undefined {
    if (raw === undefined || raw === null || raw === "") return def
    return String(raw)
}

export function num(raw: unknown): number | undefined
export function num(raw: unknown, def: number): number
export function num(raw: unknown, def?: number): number | undefined {
    if (raw === undefined || raw === null || raw === "") return def
    const value = Number(raw)
    return Number.isFinite(value) ? value : def
}

interface AppConfigImpl extends Omit<AppConfigOptions, "VIDEO_CDN_ALLOCATION"> {
    VIDEO_CDN_ALLOCATION: CDNAllocation[]
}

export class AppConfig<EnvLike extends Record<any, any> = Record<any, any>> implements AppConfigImpl{
    protected readonly DEFAULT_CDN_ALLOCATION = "AS,CN,cos;*,*,aliov"
    protected readonly DEFAULT_CDN = { "ali": "upos-sz-mirrorali.bilivideo.com", "aliov": "upos-sz-mirroraliov.bilivideo.com", "alib": "upos-sz-mirroralib.bilivideo.com", "alio1": "upos-sz-mirroralio1.bilivideo.com", "ali02": "upos-sz-mirrorali02.bilivideo.com", "cos": "upos-sz-mirrorcos.bilivideo.com", "cosb": "upos-sz-mirrorcosb.bilivideo.com", "coso1": "upos-sz-mirrorcoso1.bilivideo.com", "cosov": "upos-sz-mirrorcosov.bilivideo.com", "cosdisp": "upos-sz-mirrorcosdisp.bilivideo.com", "hw": "upos-sz-mirrorhw.bilivideo.com", "hwb": "upos-sz-mirrorhwb.bilivideo.com", "hwo1": "upos-sz-mirrorhwo1.bilivideo.com", "hwdisp": "upos-sz-mirrorhwdisp.bilivideo.com", "bd": "upos-sz-mirrorbd.bilivideo.com", "m08c": "upos-sz-mirror08c.bilivideo.com", "m08h": "upos-sz-mirror08h.bilivideo.com", "m08ct": "upos-sz-mirror08ct.bilivideo.com", "estgcos": "upos-sz-estgcos.bilivideo.com", "estgoss": "upos-sz-estgoss.bilivideo.com", "estghw": "upos-sz-estghw.bilivideo.com", "upcdnbda2": "upos-sz-upcdnbda2.bilivideo.com", "rali": "upos-sz-mirrorrali.bilivideo.com", "akam": "upos-hz-mirrorakam.akamaized.net" }

    readonly SERVER_VERSION: string | undefined

    readonly IS_SERVER_LOGIN: boolean
    readonly SERVER_LOGIN_HASHKEY: string

    readonly VIDEO_CDN_ALLOCATION: CDNAllocation[]
    readonly VIDEO_CDN: Record<string, string>

    readonly ENABLE_CACHE_DATA_VALIDATION: boolean
    readonly ENABLE_CACHE_LAYER_SYNC: boolean
    readonly CACHE_DATA_VERSION: number
    readonly ENABLE_RESPONSE_CACHING: boolean
    readonly RESPONSE_MAX_CACHE_TIME: number
    readonly KV_CACHE_BINDING: string | undefined

    readonly ENABLE_CUSTOM_COOKIES: boolean
    readonly COOKIES_SIGN_CACHE_TIME: number
    readonly CUSTOM_COOKIES: string | undefined
    readonly ENABLE_COOKIE_WEB_CACHE: boolean

    readonly BILI_VIDEO_PLAYURL_CACHE_TIME: number
    readonly BILI_VIDEO_INFO_CACHE_TIME: number
    readonly BILI_VIDEO_SUBTITLES_CACHE_TIME: number

    readonly BILI_LIVE_CACHE_TIME: number

    readonly BILI_BANGUMI_PLAYURL_CACHE_TIME: number
    readonly BILI_BANGUMI_EPISODES_CACHE_TIME: number
    readonly BILI_BANGUMI_INFO_CACHE_TIME: number

    readonly BILI_USER_ARCHIVE_CACHE_TIME: number

    readonly BILI_USER_FAV_CACHE_TIME: number

    readonly BILI_DANMAKU_CACHE_TIME: number

    readonly FETCH_MAX_RETRIES: number
    readonly FETCH_TIMEOUT: number


    readonly BILI_SEARCH_CACHE_TIME: number

    constructor(env:Partial<EnvLike>) {
        this.SERVER_VERSION = str(env.SERVER_VERSION)
        this.ENABLE_CUSTOM_COOKIES = bool(env.ENABLE_CUSTOM_COOKIES, false)
        this.CUSTOM_COOKIES = str(env.CUSTOM_COOKIES)
        this.IS_SERVER_LOGIN = this.ENABLE_CUSTOM_COOKIES && env.CUSTOM_COOKIES !== undefined
        this.SERVER_LOGIN_HASHKEY = md5String(
            `${String(this.IS_SERVER_LOGIN)}:${env.CUSTOM_COOKIES ?? ""}`
        )

        // --- CDN ---
        this.VIDEO_CDN_ALLOCATION =
            parseCDNAllocation(env.VIDEO_CDN_ALLOCATION ?? this.DEFAULT_CDN_ALLOCATION) || []

        this.VIDEO_CDN = env.VIDEO_CDN ? parseCDN(env.VIDEO_CDN) : { ...this.DEFAULT_CDN }

        // --- cache ---
        this.ENABLE_CACHE_DATA_VALIDATION = bool(env.ENABLE_CACHE_DATA_VALIDATION, true)
        this.ENABLE_CACHE_LAYER_SYNC = bool(env.ENABLE_CACHE_LAYER_SYNC, true)
        this.CACHE_DATA_VERSION = num(env.CACHE_DATA_VERSION, 5)
        this.ENABLE_RESPONSE_CACHING = bool(env.ENABLE_RESPONSE_CACHING, true)
        this.RESPONSE_MAX_CACHE_TIME = num(env.RESPONSE_MAX_CACHE_TIME, 3600)
        this.KV_CACHE_BINDING = str(env.KV_CACHE_BINDING)

        // --- cookies ---
        this.COOKIES_SIGN_CACHE_TIME = num(env.COOKIES_SIGN_CACHE_TIME, 3600)
        this.ENABLE_COOKIE_WEB_CACHE = bool(env.ENABLE_COOKIE_WEB_CACHE, true)

        // --- video ---
        this.BILI_VIDEO_PLAYURL_CACHE_TIME = num(env.BILI_VIDEO_PLAYURL_CACHE_TIME, 5400)
        this.BILI_VIDEO_INFO_CACHE_TIME = num(env.BILI_VIDEO_INFO_CACHE_TIME, 60 * 60 * 24)
        this.BILI_VIDEO_SUBTITLES_CACHE_TIME = num(env.BILI_VIDEO_SUBTITLES_CACHE_TIME, 1800)

        // --- live ---
        this.BILI_LIVE_CACHE_TIME = num(env.BILI_LIVE_CACHE_TIME, 60)

        // --- bangumi ---
        this.BILI_BANGUMI_PLAYURL_CACHE_TIME = num(env.BILI_BANGUMI_PLAYURL_CACHE_TIME, 5400)
        this.BILI_BANGUMI_EPISODES_CACHE_TIME = num(env.BILI_BANGUMI_EPISODES_CACHE_TIME, 60 * 60 * 24 * 7)
        this.BILI_BANGUMI_INFO_CACHE_TIME = num(env.BILI_BANGUMI_INFO_CACHE_TIME, 60 * 60 * 24 * 7)

        // --- archive ---
        this.BILI_USER_ARCHIVE_CACHE_TIME = num(env.BILI_USER_ARCHIVE_CACHE_TIME, 86400)

        // --- favlist ---
        this.BILI_USER_FAV_CACHE_TIME = num(env.BILI_USER_FAV_CACHE_TIME, 3600)

        // --- danmaku ---
        this.BILI_DANMAKU_CACHE_TIME = num(env.BILI_DANMAKU_CACHE_TIME, 1800)
        this.FETCH_MAX_RETRIES = num(env.PROXY_SERVER_FETCH_MAX_RETRIES, 3)
        this.FETCH_TIMEOUT = num(env.PROXY_SERVER_TIMEOUT, 10 * 1000)

        // --- search ---
        this.BILI_SEARCH_CACHE_TIME = num(env.BILI_SEARCH_CACHE_TIME, 360)
    }
}