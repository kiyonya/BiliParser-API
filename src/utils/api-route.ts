import { OpenAPIRoute } from "chanfana";
import { AppContext, BiliTypes } from "../types";
import EdgeCache from "./edge-cache";
import KVCache from "./kv-cache";
export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time: number,
    data: Data,
}

export interface CDNStrategy {
    continent: ContinentCode | '*', area: Iso3166Alpha2Code | '*', cdn: keyof BiliTypes.BiliVideoCDN
}

export interface CDNStrategyWithPriority extends CDNStrategy {
    priority: number
}
export default class APIRoute extends OpenAPIRoute {

    public SERVER_VERSION = process.env.SERVER_VERSION
    protected CF_CACHE_BASEURL = "https://bili.internal/cache"
    protected BILI_REFERER = "https://www.bilibili.com"

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
    protected CDNS_DEFAULT: CDNStrategy[] = [
        // 中国大陆
        { continent: "AS", area: "CN", cdn: "ali" },
        // 印度
        { continent: "AS", area: "IN", cdn: "aliov" },
        // 欧洲
        { continent: "EU", area: "*", cdn: "aliov" },
        // 澳大利亚
        { continent: "OC", area: "*", cdn: "aliov" },
        // 日韩
        { continent: "AS", area: "KR", cdn: "aliov" },
        { continent: "AS", area: "JP", cdn: "aliov" },
        // 港澳台
        { continent: "AS", area: "HK", cdn: "aliov" },
        { continent: "AS", area: "MO", cdn: "aliov" },
        { continent: "AS", area: "TW", cdn: "aliov" },
        // 北美
        { continent: "NA", area: "*", cdn: "aliov" },
        { continent: "*", area: "*", cdn: "aliov" }
    ]
    protected readonly BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    protected readonly MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    protected readonly BILI_NAV_IPR = "https://api.bilibili.com/x/web-interface/nav"

    protected resHeaders = new Headers({
        'Server-Version': this.SERVER_VERSION,
        'X-Nekocha': process.env.MOTD ?? "is nekocha cute?"
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
        headers['X-Cache-Edge-Hit'] = [...this.cacheHits.edge].map(i => btoa(i)).join(", ") || 'MISS'
        headers['X-Cache-KV-Hit'] = [...this.cacheHits.kv].map(i => btoa(i)).join(", ") || (this.kvCacheNotUsed ? 'NOTUSE' : 'MISS')
        return headers
    }

    get nowS() {
        return Math.floor(Date.now() / 1000)
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

    protected autoSwitchBiliCdn(ctx: AppContext, url: string, cdn?: keyof BiliTypes.BiliVideoCDN): string {
        const cf = ctx.req.raw.cf
        let cdnHostname: string | undefined = undefined
        if (cdn && this.CDNS[cdn]) {
            cdnHostname = this.CDNS[cdn]
        }
        else {
            //LPM
            const priorityStrategies: CDNStrategyWithPriority[] = this.CDNS_DEFAULT.map(i => {
                let priority = 2
                if (i.area === '*') {
                    priority--
                }
                if (i.continent === '*') {
                    priority--
                }
                return {
                    priority,
                    ...i
                }
            }).sort((a, b) => b.priority - a.priority)

            for (const strategy of priorityStrategies) {
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
}