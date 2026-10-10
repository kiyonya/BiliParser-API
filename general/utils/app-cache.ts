import z from "zod"
import { AppContext, CacheWarp } from "../types/app"
import { AppWebCache } from "./app-edge-cache"
import { AppKVCache } from "./app-kv-cache"
import { md5String } from "./hashlib"
import { BiliTypes } from "../types/bili"

export type CacheMode = "kv" | "edge" | "all"

export class AppCache {

    protected ctx: AppContext
    protected webCache?: AppWebCache
    protected kvCache?: AppKVCache
    constructor(
        ctx: AppContext,
        edgeCache?: AppWebCache,
        kvCache?: AppKVCache
    ) {
        if (!ctx.config) {
            throw new Error("context is not initialized")
        }
        this.ctx = ctx
        this.webCache = edgeCache
        this.kvCache = kvCache
    }

    protected kvCacheHits = new Set<string>()
    protected edgeCacheHits = new Set<string>()
    protected kvCacheNotUsed: boolean = false
    public minExpirationTime: number = Infinity

    public get cacheHeaders(): Record<string, string> {

        const headers: Record<string, string> = {}
        if (this.webCache) {
            if (this.edgeCacheHits.size === 0) {
                headers["X-Server-Cache-Web"] = "MISS"
            }
            else {
                const edgeHits = [...this.edgeCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
                headers["X-Server-Cache-Web"] = `${edgeHits}`
            }
        }
        if (this.kvCache) {
            if (this.kvCacheNotUsed) {
                headers['X-Server-Cache-Kv'] = "PASS"
            }
            else if (this.kvCacheHits.size === 0) {
                headers['X-Server-Cache-Kv'] = "MISS"
            }
            else {
                const kvHits = [...this.kvCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
                headers['X-Server-Cache-Kv'] = `${kvHits}`
            }
        }
        return headers
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        if (!schema || !this.ctx.config.ENABLE_CAHCE_DATA_VALIDATION) { return true }
        return (await schema.safeParseAsync(data)).success
    }

    public async setCache<Data = any>(key: string, data: Data, expirationAtCall: number | ((data: Data) => number), schema?: z.ZodType<Data>, mode: CacheMode = "all"): Promise<void> {
        try {
            if (!this.kvCache && !this.webCache) { return }
            if (!await this.validateSchema(data, schema)) { return }
            const expirationAt: number = typeof expirationAtCall === 'function'
                ? expirationAtCall(data)
                : expirationAtCall;
            if (expirationAt < this.minExpirationTime) {
                this.minExpirationTime = expirationAt
            }
            const warp: CacheWarp<Data> = {
                data: data,
                expirationAt: expirationAt,
                key: key
            }
            //只序列化一次不等待
            const serialized = JSON.stringify(warp)
            const tasks: Promise<any>[] = [];
            if (mode === 'all' || mode === 'edge') {
                this.webCache && tasks.push(this.webCache?.setEdgeCacheRaw(key, serialized, expirationAt));
            }
            if (mode === 'all' || mode === 'kv') {
                this.kvCache && tasks.push(this.kvCache.setKVCacheRaw(key, serialized, expirationAt));
            }
            if (tasks.length > 0) {
                await this.ctx.defer(Promise.allSettled(tasks));
            }
        } catch (error) {
            return;
        }
    }

    /**
     * 
     * @param key 
     * @param schema schema to validate data, use getSchemaValidData to avoid repeat schema valiation
     * @param mode 
     * @param addkey 
     * @returns 
     */
    public async getCache<Data = any>(key: string, schema?: z.ZodType<Data>, mode: CacheMode = "all", addkey: boolean = true): Promise<Data | null> {
        try {
            if (!this.kvCache && !this.webCache) { return null }
            if (mode === 'edge') {
                const edgeCache = await this.webCache?.getEdgeCache<Data>(key);
                if (edgeCache) {
                    addkey && this.edgeCacheHits.add(key)
                    this.kvCacheNotUsed = true;
                    if (edgeCache.raw.expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = edgeCache.raw.expirationAt
                    }
                    const data = edgeCache.data
                    if (await this.validateSchema(data, schema)) {
                        return data
                    }
                }
            }
            else if (mode === 'kv') {
                const kvCache = await this.kvCache?.getKVCache<Data>(key);
                if (kvCache) {
                    addkey && this.kvCacheHits.add(key)
                    this.kvCacheNotUsed = false;
                    if (kvCache.raw.expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = kvCache.raw.expirationAt
                    }
                    const data = kvCache.data
                    if (await this.validateSchema(data, schema)) {
                        return data
                    }
                }
            }
            else if (mode === 'all') {
                const edgeCache = await this.webCache?.getEdgeCache<Data>(key);
                if (edgeCache) {
                    addkey && this.edgeCacheHits.add(key)
                    this.kvCacheNotUsed = true;
                    if (edgeCache.raw.expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = edgeCache.raw.expirationAt
                    }
                    const data = edgeCache.data
                    if (await this.validateSchema(data, schema)) {
                        return data
                    }
                }
                const kvCache = await this.kvCache?.getKVCache<Data>(key);
                if (kvCache) {
                    addkey && this.kvCacheHits.add(key)
                    this.kvCacheNotUsed = false;
                    const expirationAt = kvCache.raw.expirationAt;
                    if (expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = expirationAt
                    }
                    const data = kvCache.data
                    if (await this.validateSchema(data, schema)) {
                        //这里不使用defer而是硬性要求等待
                        //kv命中edge不命中的情况只有在跨数据中心时才会出现,属于概率没有那么大的事件
                        //defer会将回写edge的promise放入队列等待时机执行，虽然会让getCache返回快一些
                        //但是当请求次数较多时，edge不能快速生效，而且可能会被多次从kv回写
                        //edge本身不付费，kv是计费的，让kv少读取是关键的
                        //所以，在小概率情况下多等待一会让edge生效来避免后续反复从kv读取是有价值的，这个时间不会有明显的察觉
                        //而且大部分时间edge命中直接就返回了，也轮不到回写
                        //况且edge速度很快，kv读取和写入大概需要200ms 下面的promise执行不会超过200ms 所以等一次爽一年和爽一次等一年的取舍还是值得的
                        const raw = kvCache.raw
                        await this.webCache?.setEdgeCache(raw.key, data, raw.expirationAt)
                        return data
                    }
                }
            }
            return null
        } catch (error) {
            return null;
        }
    }
}

export class AppCacheKey {
    private readonly CACHE_DATA_VERSION: string | number
    constructor(ctx: AppContext) {
        if (!ctx.config) {
            throw new Error("context is not initialized")
        }
        this.CACHE_DATA_VERSION = ctx.config.CACHE_DATA_VERSION
    }

    public cookie() {
        return `${this.CACHE_DATA_VERSION}:BILI_COMMON_COOKIES`
    }

    public videoInfoBv(bvid: string) {
        return `${this.CACHE_DATA_VERSION}:videoInfo:bvid:${bvid}`
    }

    public videoInfoAv(avid: number) {
        return `${this.CACHE_DATA_VERSION}:videoInfo:aid:${avid}`
    }

    public videoPlayUrl(
        cid: number,
        qn: number,
        platform: BiliTypes.RES.Video.VideoPlayPlatform,
        format: BiliTypes.RES.Video.VideoPlayFormat,
        loginKey: string
    ) {
        return `${this.CACHE_DATA_VERSION}:videoPlayUrl:${loginKey}:${cid}:${qn}:${platform}:${format}`
    }

    public videoSubtitles(cid: number) {
        return `${this.CACHE_DATA_VERSION}:subtitle:${cid}`
    }

    public userArchieves(mid: number, seasonId: number, page: number, pageSize: number) {
        return `${this.CACHE_DATA_VERSION}:userArchieves:${mid}:${seasonId}:${page}:${pageSize}`
    }

    public userFav(fid: number, keyword: string | undefined, page: number, pageSize: number) {
        const keywordHash = keyword ? md5String(keyword.trim()) : "all"
        return `${this.CACHE_DATA_VERSION}:userFav:${fid}:${keywordHash}:${page}:${pageSize}`
    }

    public bangumiInfo(seasonId?: number, episodeId?: number) {
        if (seasonId) {
            return `${this.CACHE_DATA_VERSION}:bangumiInfo:season:${seasonId}`
        }
        return `${this.CACHE_DATA_VERSION}:bangumiInfo:episode:${episodeId}`
    }

    public bangumiEpisodes(seasonId?: number) {
        return `${this.CACHE_DATA_VERSION}:bangumiEpisodes:season:${seasonId}`
    }

    public danmaku(cid: number) {
        return `${this.CACHE_DATA_VERSION}:danmaku:${cid}`
    }

    public danmakuJSON(cid: number) {
        return `${this.CACHE_DATA_VERSION}:danmakuJSON:${cid}`
    }

    public live(
        roomId: number,
        platform: "xlive" | "h5",
        codec: "avc" | "hevc",
        format: "fmp4" | "flv" | "ts",
        protocol: "stream" | "hls"
    ) {
        return `${this.CACHE_DATA_VERSION}:live:${roomId}:${platform}:${codec}:${format}:${protocol}`
    }

    public search(
        keyword: string,
        type: BiliTypes.RES.Search.SearchType,
        page: number,
        pageSize: number,
        order?: string
    ) {
        const keywordHash = md5String(keyword.trim())
        return `${this.CACHE_DATA_VERSION}:search:${type}:${keywordHash}:${page}:${pageSize}:${order ? order : "common_order"}`
    }
}

