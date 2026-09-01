import z from "zod"
import { AppContext } from "../types"
import EdgeCache from "./edge-cache"
import KVCache from "./kv-cache"

export type CacheMode = "kv" | "edge" | "all"

export default class CacheableObject {
    
    public edgeCache: EdgeCache
    public kvCache: KVCache
    public cacheHits = {
        edge: new Set<string>(),
        kv: new Set<string>()
    }
    public cacheExtraHeaders:Record<string,string> = {}
    public kvCacheNotUsed: boolean = false

    constructor(kvns: string = "BILI_API_CACHE") {
        this.edgeCache = new EdgeCache()
        this.kvCache = new KVCache(kvns)
    }

    public async setCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAtCall: number | ((data: Data) => number), validate?: z.ZodType<Data>, mode: CacheMode = "all"): Promise<void> {
        try {
            const expirationAt: number = typeof expirationAtCall === 'function'
                ? expirationAtCall(data)
                : expirationAtCall;
            const tasks: Promise<any>[] = [];
            if (mode === 'all' || mode === 'edge') {
                tasks.push(this.edgeCache.setEdgeCache(ctx, key, data, expirationAt, validate));
            }
            if (mode === 'all' || mode === 'kv') {
                tasks.push(this.kvCache.setKVCache(ctx, key, data, expirationAt, validate));
            }
            if (tasks.length > 0) {
                await Promise.allSettled(tasks);
            }
        } catch (error) {
            return;
        }
    }

    public async getCache<Data = any>(ctx: AppContext, key: string, validate?: z.ZodType<Data>, mode: CacheMode = "all",addkey:boolean = true): Promise<Data | null> {
        try {
            if (mode === 'edge') {
                const edgeCache = await this.edgeCache.getEdgeCache<Data>(ctx, key, validate);
                if (edgeCache) {
                    addkey && this.cacheHits.edge.add(key);
                    this.kvCacheNotUsed = true;
                    return edgeCache.data;
                }
                return null;
            }
            if (mode === 'kv') {
                const kvCache = await this.kvCache.getKVCache<Data>(ctx, key, validate);
                if (kvCache) {
                    addkey && this.cacheHits.kv.add(key);
                    this.kvCacheNotUsed = false;
                    return kvCache.data;
                }
                return null;
            }
            const edgeCache = await this.edgeCache.getEdgeCache<Data>(ctx, key, validate);
            if (edgeCache) {
                addkey && this.cacheHits.edge.add(key);
                this.kvCacheNotUsed = true;
                return edgeCache.data;
            }
            const kvCache = await this.kvCache.getKVCache<Data>(ctx, key, validate);
            if (kvCache) {
                addkey && this.cacheHits.kv.add(key);
                this.kvCacheNotUsed = false;
                const kvCacheKey = kvCache.raw.key;
                const expirationAt = kvCache.raw.expirationAt;
                await this.edgeCache.setEdgeCache(ctx, kvCacheKey, kvCache.data, expirationAt);
                return kvCache.data;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}