import { OpenAPIRoute } from "chanfana";
import { AppContext, BiliTypes } from "../types";
import EdgeCache from "./edge-cache";
import KVCache from "./kv-cache";
import { b23Parser } from "./b23-parse";
import crypto from 'crypto'
import z from "zod";
import { Config } from "../config";
export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time: number,
    data: Data,
}

export default class APIRoute extends OpenAPIRoute {

    public SERVER_VERSION = process.env.SERVER_VERSION
    public CACHE_DATA_VERSION = 3
    protected CF_CACHE_BASEURL = "https://bili.internal/cache"
    protected BILI_REFERER = "https://www.bilibili.com"
    protected BILI_VIDEO_PATTERN = new URLPattern("*://*bilibili.com/video/*")
    protected BILI_B23TV_PATTERN = new URLPattern("*://*b23.tv/*")

    protected CDNS: BiliTypes.BiliVideoCDN = {
        ali: 'upos-sz-mirrorali.bilivideo.com',
        aliov: 'upos-sz-mirroraliov.bilivideo.com',
        alib: 'upos-sz-mirroralib.bilivideo.com',
        alio1: 'upos-sz-mirroralio1.bilivideo.com',
        ali02: 'upos-sz-mirrorali02.bilivideo.com',
        cos: 'upos-sz-mirrorcos.bilivideo.com',
        cosb: 'upos-sz-mirrorcosb.bilivideo.com',
        coso1: 'upos-sz-mirrorcoso1.bilivideo.com',
        cosov: 'upos-sz-mirrorcosov.bilivideo.com',
        cosdisp: 'upos-sz-mirrorcosdisp.bilivideo.com',
        hw: 'upos-sz-mirrorhw.bilivideo.com',
        hwb: 'upos-sz-mirrorhwb.bilivideo.com',
        hwo1: 'upos-sz-mirrorhwo1.bilivideo.com',
        hwdisp: 'upos-sz-mirrorhwdisp.bilivideo.com',
        bd: 'upos-sz-mirrorbd.bilivideo.com',
        m08c: 'upos-sz-mirror08c.bilivideo.com',
        m08h: 'upos-sz-mirror08h.bilivideo.com',
        m08ct: 'upos-sz-mirror08ct.bilivideo.com',
        estgcos: 'upos-sz-estgcos.bilivideo.com',
        estgoss: 'upos-sz-estgoss.bilivideo.com',
        estghw: 'upos-sz-estghw.bilivideo.com',
        upcdnbda2: 'upos-sz-upcdnbda2.bilivideo.com',
        rali: 'upos-sz-mirrorrali.bilivideo.com',
        akam: "upos-hz-mirrorakam.akamaized.net"
    }
    protected readonly BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    protected readonly MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    protected readonly BILI_NAV_IPR = "https://api.bilibili.com/x/web-interface/nav"

    protected resHeaders = new Headers({
        'Server-Version': this.SERVER_VERSION,
        'X-Nekocha': process.env.MOTD ?? "is nekocha cute?",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    })
    protected EdgeCache = new EdgeCache()
    protected KVCache = new KVCache('BILI_API_CACHE')
    protected cacheHits = {
        edge: new Set<string>(),
        kv: new Set<string>()
    }
    protected kvCacheNotUsed: boolean = false

    get headers() {
        const headers: Record<string, string> = {}
        for (const [k, v] of this.resHeaders) {
            headers[k] = String(v)
        }
        headers['X-Cache-Edge-Hit'] = [...this.cacheHits.edge].map(i => this.md5String(i)).join(", ") || 'MISS'
        headers['X-Cache-KV-Hit'] = [...this.cacheHits.kv].map(i => this.md5String(i)).join(", ") || (this.kvCacheNotUsed ? 'NOTUSE' : 'MISS')
        return headers
    }

    get nowS() {
        return Math.floor(Date.now() / 1000)
    }

    protected md5String(string: string) {
        return crypto.createHash('md5').update(string).digest('hex')
    }

    protected async setCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAtCall: number | ((data: Data) => number), validate?: (data: Data) => boolean): Promise<void> {
        try {
            const expirationAt: number = typeof expirationAtCall === 'function' ? expirationAtCall(data) : expirationAtCall
            await Promise.allSettled([
                this.EdgeCache.setEdgeCache(ctx, key, data, expirationAt, validate),
                this.KVCache.setKVCache(ctx, key, data, expirationAt, validate)
            ])
        } catch (error) {
            return
        }
    }

    protected async getCache<Data = any>(ctx: AppContext, key: string, validate?: (data: Data) => boolean): Promise<Data | null> {
        try {
            const edgeCache = await this.EdgeCache.getEdgeCache<Data>(ctx, key, validate)
            if (edgeCache) {
                this.cacheHits.edge.add(key)
                this.kvCacheNotUsed = true
                return edgeCache.data
            }
            const kvCache = await this.KVCache.getKVCache<Data>(ctx, key, validate)
            if (kvCache) {
                this.cacheHits.kv.add(key)
                this.kvCacheNotUsed = false
                const kvCacheKey = kvCache.raw.key
                const expirationAt = kvCache.raw.expirationAt
                await this.EdgeCache.setEdgeCache(ctx, kvCacheKey, kvCache.data, expirationAt)
                return kvCache.data
            }
            return null
        } catch (error) {
            return null
        }
    }

    protected jsonResponse<Data = any>(ctx: AppContext, message: string, code: number, data: Data, headers?: Record<string, string>): Response {
        headers = {
            "Content-Type": "application/json",
            ...this.headers,
            ...headers
        }
        const response: APIResponse<Data> = {
            code: code,
            message: message ?? "",
            data: data,
            time: Date.now()
        }
        return ctx.json(response, code as any, headers)
    }

    protected async checkRateLimit(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const pathname = url.pathname
        const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
        if (!success) {
            return ctx.text(`429 Too Many Requests`, 429)
        }
    }

    protected autoSwitchBiliCdn(ctx: AppContext, url: string, cdn?: keyof BiliTypes.BiliVideoCDN): string {
        const cf = ctx.req.raw.cf
        let cdnHostname: string | undefined = undefined
        if (cdn && this.CDNS[cdn]) {
            cdnHostname = this.CDNS[cdn]
        }
        else {
            for (const strategy of Config.VideoCDNStrategy) {
                const isMatch = (strategy.continent === '*' || cf?.continent === strategy.continent) && (strategy.area === '*' || cf?.country === strategy.area)
                if (isMatch) {
                    const cdnName = strategy.cdn
                    cdnHostname = this.CDNS[cdnName]
                    this.resHeaders.set('X-CDN-Strategy', `${strategy.continent},${strategy.area},${cdnName}`)
                    break
                }
            }
        }
        if (cdnHostname) {
            const _ = new URL(url)
            _.hostname = cdnHostname
            url = _.toString()
            this.resHeaders.set('X-Bili-CDN', cdnHostname)
        }
        return url
    }

    protected async getBvParamsFromUrl(biliurl: string | URL): Promise<{ bvid: string, p: number } | null> {
        try {
            let url: URL = new URL(biliurl)
            if (this.BILI_B23TV_PATTERN.test(url)) {
                const rawURL = await b23Parser(url.toString())
                url = new URL(rawURL)
            }

            if (this.BILI_VIDEO_PATTERN.test(url)) {
                const pathname = url.pathname
                const bvpart = pathname.match(/(BV[a-zA-Z0-9]{10})/)?.[1]
                const part = url.searchParams.get("p") || undefined
                const bvid = z.string().trim().nullable().default(null).safeParse(bvpart).data
                const p = z.coerce.number().default(1).safeParse(part).data
                if (bvid && p) {
                    return { bvid: bvid, p: p }
                }
            }
            return null
        } catch (error) {
            return null
        }
    }

    protected readonly CacheKey = {
        videoInfo: (bvid: string) => {
            return `${this.CACHE_DATA_VERSION}:videoInfo:${bvid}`
        },
        videoPlayUrl: (cid: number, qn: number, platform: BiliTypes.BVideoPlatform) => {
            return `${this.CACHE_DATA_VERSION}:videoPlayUrl:${cid}:${qn}:${platform}`
        },
        userArchieves: (mid: number, seasonId: number, page: number, pageSize: number) => {
            return `${this.CACHE_DATA_VERSION}:userArchieves:${mid}:${seasonId}:${page}:${pageSize}`
        },
        bangumiInfo: (seasonId?: number, episodeId?: number) => {
            if (seasonId) {
                return `${this.CACHE_DATA_VERSION}:bangumiInfo:season:${seasonId}`
            }
            return `${this.CACHE_DATA_VERSION}:bangumiInfo:episode:${episodeId}`
        },
        bangumiEpisodes: (seasonId?: number) => {
            return `${this.CACHE_DATA_VERSION}:bangumiEpisodes:season:${seasonId}`
        },
        bangumiPlayUrl: (epid: number, qn: number) => {
            return `${this.CACHE_DATA_VERSION}:bangumiPlayUrl:${epid}:${qn}`
        },
        danmaku: (cid: number) => {
            return `${this.CACHE_DATA_VERSION}:danmaku:${cid}`
        },
        live: (roomId: number) => {
            return `${this.CACHE_DATA_VERSION}:live:${roomId}`
        }
    }
}