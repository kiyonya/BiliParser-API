import z from "zod"
import { AppContext, CacheWarp } from "../types"
import { Config } from "../config"
import EdgeCache from "./edge-cache"
import KVCache from "./kv-cache"
import { md5String } from "./hashlib"

export type CacheMode = "kv" | "edge" | "all"

export default class CacheableObject {

    protected ctx: AppContext
    protected edgeCache: EdgeCache
    protected kvCache?: KVCache

    constructor(ctx: AppContext) {
        this.ctx = ctx
        this.edgeCache = new EdgeCache()
        const kvBinding = Config.KV_CACHE_BINGDING
        if (kvBinding &&
            // @ts-ignore
            ctx.env[kvBinding]
        ) {
            this.kvCache = new KVCache(kvBinding)
        }
    }

    protected kvCacheHits = new Set<string>()
    protected edgeCacheHits = new Set<string>()
    protected kvCacheNotUsed: boolean = false
    public minExpirationTime: number = Infinity

    public get cacheHeaders(): Record<string, string> {
        const kvHits = [...this.kvCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
        const edgeHits = [...this.edgeCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
        const cacheHeaderParts: string[] = []
        if (this.edgeCache) {
            cacheHeaderParts.push(`edge;hit="${edgeHits || "MISS"}"`)
        }
        if (this.kvCache) {
            cacheHeaderParts.push(`kv;hit="${kvHits || (this.kvCacheNotUsed ? "UNUSED" : "MISS")}"`)
        } else {
            cacheHeaderParts.push(`kv;hit="DISABLED"`)
        }
        const headers: Record<string, string> = {}
        headers['X-Server-Cache-Status'] = cacheHeaderParts.join(", ")
        return headers
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        if (!schema || !Config.ENABLE_CAHCE_DATA_VALIDATION) { return true }
        return (await schema.safeParseAsync(data)).success
    }

    public async setCache<Data = any>(key: string, data: Data, expirationAtCall: number | ((data: Data) => number), schema?: z.ZodType<Data>, mode: CacheMode = "all"): Promise<void> {
        try {
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
                tasks.push(this.edgeCache.setEdgeCacheRaw(this.ctx, key, serialized, expirationAt));
            }
            if (mode === 'all' || mode === 'kv') {
                if (!this.kvCache) { return }
                tasks.push(this.kvCache.setKVCacheRaw(this.ctx, key, serialized, expirationAt));
            }
            if (tasks.length > 0) {
                this.ctx.defer(Promise.allSettled(tasks));
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
            if (mode === 'edge') {
                const edgeCache = await this.edgeCache.getEdgeCache<Data>(this.ctx, key);
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
                if (!this.kvCache) { return null }
                const kvCache = await this.kvCache.getKVCache<Data>(this.ctx, key);
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
                const edgeCache = await this.edgeCache.getEdgeCache<Data>(this.ctx, key);
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
                if (!this.kvCache) { return null }
                const kvCache = await this.kvCache.getKVCache<Data>(this.ctx, key);
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
                        await this.edgeCache.setEdgeCache(this.ctx, raw.key, data, raw.expirationAt)
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