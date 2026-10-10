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
    constructor(env: Record<any, string>) {
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
        return this.memo("isServerLogin", () => this.ENABLE_CUSTOM_COOKIES && this.env.CUSTOM_COOKIES !== undefined)
    }

    public get SERVER_LOGIN_HASHKEY() {
        return this.memo("serverLoginKeyHash", () => {
            const key = `${String(this.IS_SERVER_LOGIN)}:${this.env.CUSTOM_COOKIES ?? ""}`
            return md5String(key)
        })
    }

    //cdn
    public get VIDEO_CDN_ALLOCATION(): CDNAllocation[] {
        return this.memo("VIDEO_CDN_ALLOCATION", () => parseCDNAllocation(this.env.VIDEO_CDN_ALLOCATION ?? this.DEFAULT_CDN_ALLOCATION)) || []
    }

    public get VIDEO_CDN(): Record<string, string> {
        return this.memo('VIDEO_CDN', () => parseCDN(this.env.VIDEO_CDN ?? this.DEFAULT_CDN)) || {}
    }

    //cache
    public get ENABLE_CACHE_DATA_VALIDATION(): boolean {
        return this.memo("ENABLE_CACHE_DATA_VALIDATION", () => bool(this.env.ENABLE_CACHE_DATA_VALIDATION, true))!
    }

    public get CACHE_DATA_VERSION(): number {
        return this.memo("CACHE_DATA_VERSION", () => num(this.env.CACHE_DATA_VERSION, 5))!
    }

    public get RESPONSE_WORKER_CACHING(): boolean {
        return this.memo("RESPONSE_WORKER_CACHING", () => bool(this.env.RESPONSE_WORKER_CACHING, true))!
    }

    public get RESPONSE_MAX_CACHE_TIME(): number {
        return this.memo('RESPONSE_MAX_CACHE_TIME', () => num(this.env.RESPONSE_MAX_CACHE_TIME, 3600))!
    }

    public get KV_CACHE_BINDING(): string | undefined {
        return this.memo("KV_CACHE_BINDING", () => str(this.env.KV_CACHE_BINDING))
    }

    //cookies
    public get ENABLE_CUSTOM_COOKIES(): boolean {
        return this.memo("ENABLE_CUSTOM_COOKIES", () => bool(this.env.ENABLE_CUSTOM_COOKIES, false))!
    }

    public get COOKIES_SIGN_CACHE_TIME(): number {
        return this.memo("COOKIES_SIGN_CACHE_TIME", () => num(this.env.COOKIES_SIGN_CACHE_TIME, 3600))!
    }

    public get CUSTOM_COOKIES(): string | undefined {
        return this.memo('CUSTOM_COOKIES', () => str(this.env.CUSTOM_COOKIES))
    }

    //video
    public get BILI_VIDEO_PLAYURL_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_PLAYURL_CACHE_TIME", () => num(this.env.BILI_VIDEO_PLAYURL_CACHE_TIME, 5400))!
    }

    public get BILI_VIDEO_INFO_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_INFO_CACHE_TIME", () => num(this.env.BILI_VIDEO_INFO_CACHE_TIME, 60 * 60 * 24))!
    }

    public get BILI_VIDEO_SUBTITLES_CACHE_TIME(): number {
        return this.memo("BILI_VIDEO_SUBTITLES_CACHE_TIME", () => num(this.env.BILI_VIDEO_SUBTITLES_CACHE_TIME, 1800))!
    }

    //live
    public get BILI_LIVE_CACHE_TIME(): number {
        return this.memo("BILI_LIVE_CACHE_TIME", () => num(this.env.BILI_LIVE_CACHE_TIME, 60))!
    }

    //bangumi
    public get BILI_BANGUMI_PLAYURL_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_PLAYURL_CACHE_TIME", () => num(this.env.BILI_BANGUMI_PLAYURL_CACHE_TIME, 5400))!
    }

    public get BILI_BANGUMI_EPISODES_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_EPISODES_CACHE_TIME", () => num(this.env.BILI_BANGUMI_EPISODES_CACHE_TIME, 60 * 60 * 24 * 7))!
    }

    public get BILI_BANGUMI_INFO_CACHE_TIME(): number {
        return this.memo("BILI_BANGUMI_INFO_CACHE_TIME", () => num(this.env.BILI_BANGUMI_INFO_CACHE_TIME, 60 * 60 * 24 * 7))!
    }

    //archive
    public get BILI_USER_ARCHIVE_CACHE_TIME(): number {
        return this.memo("BILI_USER_ARCHIVE_CACHE_TIME", () => num(this.env.BILI_USER_ARCHIVE_CACHE_TIME, 86400))!
    }

    //favlist
    public get BILI_USER_FAV_CACHE_TIME(): number {
        return this.memo("BILI_USER_FAV_CACHE_TIME", () => num(this.env.BILI_USER_FAV_CACHE_TIME, 3600))!
    }

    //danmaku
    public get BILI_DANMAKU_CACHE_TIME(): number {
        return this.memo("BILI_DANMAKU_CACHE_TIME", () => num(this.env.BILI_DANMAKU_CACHE_TIME, 1800))!
    }

    //proxy
    public get ENABLE_PROXY_SERVER(): boolean {
        return this.memo("ENABLE_PROXY_SERVER", () => bool(this.env.ENABLE_PROXY_SERVER, true))!
    }

    public get PROXY_SERVER_FETCH_MAX_RETRIES(): number {
        return this.memo("PROXY_SERVER_FETCH_MAX_RETRIES", () => num(this.env.PROXY_SERVER_FETCH_MAX_RETRIES, 3))!
    }

    public get PROXY_SERVER_TIMEOUT(): number {
        return this.memo("PROXY_SERVER_TIMEOUT", () => num(this.env.PROXY_SERVER_TIMEOUT, 10 * 1000))!
    }

    public get PROXY_SERVER_URL(): string | undefined {
        return this.memo("PROXY_SERVER_URL", () => str(this.env.PROXY_SERVER_URL))
    }

    public get PROXY_SERVER_TOKEN(): string | undefined {
        return this.memo("PROXY_SERVER_TOKEN", () => str(this.env.PROXY_SERVER_TOKEN))
    }

    public get PROXY_TOKEN_HEADER(): string {
        return this.memo("PROXY_TOKEN_HEADER", () => str(this.env.PROXY_TOKEN_HEADER, "X-Proxy-Token"))
    }

    //search
    public get BILI_SEARCH_CACHE_TIME(): number {
        return this.memo("BILI_SEARCH_CACHE_TIME", () => num(this.env.BILI_SEARCH_CACHE_TIME, 360))!
    }
}