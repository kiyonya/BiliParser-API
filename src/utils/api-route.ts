import { OpenAPIRoute } from "chanfana";
import { APITypes, AppContext, BiliTypes } from "../types";
import EdgeCache from "./edge-cache";
import KVCache from "./kv-cache";

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time: number,
    data: Data,
}


export default class APIRoute extends OpenAPIRoute {

    public SERVER_VERSION = process.env.X_SERVER_VERSION
    public CF_CACHE_BASEURL = "https://bili.internal/cache"

    protected readonly BILI_VIDEO_PLAYURL_CACHE_TIME = process.env.X_VIDEO_PLAYURL_CACHE_TIME ? parseInt(process.env.X_VIDEO_PLAYURL_CACHE_TIME) : 5400

    protected readonly BILI_BANGUMI_PLAYURL_CACHE_TIME = process.env.X_BANGUMI_PLAYURL_CACHE_TIME ? parseInt(process.env.X_BANGUMI_PLAYURL_CACHE_TIME) : 5400

    protected readonly BILI_VIDEO_INFO_CACHE_TIME = process.env.X_VIDEO_INFO_CACHE_TIME ? parseInt(process.env.X_VIDEO_INFO_CACHE_TIME) : 60 * 60 * 24

    protected readonly BILI_BANGUMI_EPISODES_CACHE_TIME = process.env.X_BANGUMI_EPISODES_CACHE_TIME ? parseInt(process.env.X_BANGUMI_EPISODES_CACHE_TIME) : 60 * 60 * 24 * 7

    protected readonly BILI_BANGUMI_INFO_CACHE_TIME = process.env.X_BANGUMI_INFO_CACHE_TIME ? parseInt(process.env.X_BANGUMI_INFO_CACHE_TIME) : 60 * 60 * 24 * 7

    protected readonly BILI_LIVE_CACHE_TIME = process.env.X_BILI_LIVE_CACHE_TIME ? parseInt(process.env.X_BILI_LIVE_CACHE_TIME) : 60

    protected CDNS: BiliTypes.BiliVideoCDN = {
        ali: 'upos-sz-mirrorali.bilivideo.com',
        aliov: 'upos-sz-mirroraliov.bilivideo.com',
        alib: 'upos-sz-mirroralib.bilivideo.com',
        alio1: 'upos-sz-mirroralio1.bilivideo.com',
        ali02: 'upos-sz-mirrorali02.bilivideo.com',
        cos: 'upos-sz-mirrorcos.bilivideo.com',
        cosb: 'upos-sz-mirrorcosb.bilivideo.com',
        coso1: 'upos-sz-mirrorcoso1.bilivideo.com',
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
    protected readonly BILI_VIDEO_CNCDN = "ali"
    protected readonly BILI_VIDEO_OVCDN = "aliov"
    protected readonly BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    protected readonly MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    protected readonly BILI_NAV_IPR = "https://api.bilibili.com/x/web-interface/nav"

    protected resHeaders = new Headers({
        'Server-Version': this.SERVER_VERSION,
        'X-Nekocha': "isn't nekocha cute?"
    })
    protected EdgeCache = new EdgeCache()
    protected KVCache = new KVCache('BILI_CACHE')
    protected cacheHits = {
        edge: new Set<string>(),
        kv: new Set<string>()
    }

    get headers() {
        const headers: Record<string, string> = {}
        for (const [k, v] of this.resHeaders) {
            headers[k] = String(v)
        }
        headers['X-Cache-Edge-Hit'] = [...this.cacheHits.edge].map(i => btoa(i)).join(", ") || 'MISS'
        headers['X-Cache-KV-Hit'] = [...this.cacheHits.kv].map(i => btoa(i)).join(", ") || 'MISS'
        return headers
    }

    get nowS() {
        return Math.floor(Date.now() / 1000)
    }

    protected async setCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAtCall: number | ((data: Data) => number)): Promise<void> {
        try {
            const expirationAt: number = typeof expirationAtCall === 'function' ? expirationAtCall(data) : expirationAtCall
            await Promise.allSettled([
                this.EdgeCache.setEdgeCache(ctx, key, data, expirationAt),
                this.KVCache.setKVCache(ctx, key, data, expirationAt)
            ])
        } catch (error) {
            return
        }
    }

    protected async getCache<Data = any>(ctx: AppContext, key: string): Promise<Data | null> {
        try {
            const edgeCache = await this.EdgeCache.getEdgeCache<Data>(ctx, key)
            if (edgeCache) {
                this.cacheHits.edge.add(key)
                return edgeCache.data
            }
            const kvCache = await this.KVCache.getKVCache<Data>(ctx, key)
            if (kvCache) {
                this.cacheHits.kv.add(key)
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
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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


}