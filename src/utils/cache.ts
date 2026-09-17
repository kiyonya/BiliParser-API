import z from "zod"
import { AppContext } from "../types"
import EdgeCache from "./edge-cache"
import KVCache from "./kv-cache"
import { md5String } from "./hashlib"

export type CacheMode = "kv" | "edge" | "all"

export default class CacheableObject {

    protected ctx: AppContext
    public edgeCache: EdgeCache
    public kvCache: KVCache

    constructor(ctx: AppContext, kvns: string = "BILI_API_CACHE") {
        this.ctx = ctx
        this.edgeCache = new EdgeCache()
        this.kvCache = new KVCache(kvns)
    }

    protected kvCacheHits = new Set<string>()
    protected edgeCacheHits = new Set<string>()
    protected kvCacheNotUsed: boolean = false
    public minExpirationTime: number = Infinity

    public get cacheHeaders(): Record<string, string> {

        const kvHits = [...this.kvCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
        const edgeHits = [...this.edgeCacheHits].map(key => md5String(key).slice(0, 6)).join(",")
        const headers: Record<string, string> = {}
        headers['X-Server-Cache-Status'] = `edge;hit="${edgeHits || "MISS"}",kv;hit="${kvHits ||  (this.kvCacheNotUsed ? "UNUSED" : "MISS")}"`
        return headers
    }

    public async setCache<Data = any>(key: string, data: Data, expirationAtCall: number | ((data: Data) => number), schema?: z.ZodType<Data>, mode: CacheMode = "all"): Promise<void> {
        try {
            const expirationAt: number = typeof expirationAtCall === 'function'
                ? expirationAtCall(data)
                : expirationAtCall;
            if (expirationAt < this.minExpirationTime) {
                this.minExpirationTime = expirationAt
            }
            const tasks: Promise<any>[] = [];
            if (mode === 'all' || mode === 'edge') {
                tasks.push(this.edgeCache.setEdgeCache(this.ctx, key, data, expirationAt, schema));
            }
            if (mode === 'all' || mode === 'kv') {
                tasks.push(this.kvCache.setKVCache(this.ctx, key, data, expirationAt, schema));
            }
            if (tasks.length > 0) {
                await Promise.allSettled(tasks);
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
                const edgeCache = await this.edgeCache.getEdgeCache<Data>(this.ctx, key, schema);
                if (edgeCache) {
                    addkey && this.edgeCacheHits.add(key)
                    this.kvCacheNotUsed = true;
                    if (edgeCache.raw.expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = edgeCache.raw.expirationAt
                    }
                    return edgeCache.data;
                }
                return null;
            }
            if (mode === 'kv') {
                const kvCache = await this.kvCache.getKVCache<Data>(this.ctx, key, schema);
                if (kvCache) {
                    addkey && this.kvCacheHits.add(key)
                    this.kvCacheNotUsed = false;
                    if (kvCache.raw.expirationAt < this.minExpirationTime) {
                        this.minExpirationTime = kvCache.raw.expirationAt
                    }
                    return kvCache.data;
                }
                return null;
            }
            const edgeCache = await this.edgeCache.getEdgeCache<Data>(this.ctx, key, schema);
            if (edgeCache) {
                addkey && this.edgeCacheHits.add(key)
                this.kvCacheNotUsed = true;
                if (edgeCache.raw.expirationAt < this.minExpirationTime) {
                    this.minExpirationTime = edgeCache.raw.expirationAt
                }
                return edgeCache.data;
            }
            const kvCache = await this.kvCache.getKVCache<Data>(this.ctx, key, schema);
            if (kvCache) {
                addkey && this.kvCacheHits.add(key)
                this.kvCacheNotUsed = false;
                const kvCacheKey = kvCache.raw.key;
                const expirationAt = kvCache.raw.expirationAt;
                await this.edgeCache.setEdgeCache(this.ctx, kvCacheKey, kvCache.data, expirationAt, schema);
                if (expirationAt < this.minExpirationTime) {
                    this.minExpirationTime = expirationAt
                }
                return kvCache.data;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}