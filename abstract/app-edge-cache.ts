import z from "zod";
import { AppContext, CacheResult } from "../types/app";
import { md5String } from "../utils/hashlib";

export abstract class AppEdgeCache {
    
    protected ctx: AppContext
    constructor(ctx: AppContext) {
        this.ctx = ctx
    }
    protected createVCacheKey(ctx: AppContext,cacheKey: string) {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = md5String(cacheKey);
        const keyUrl = new URL(`${reqUrl.protocol}//${reqUrl.hostname}`);
        keyUrl.pathname = `/edgecache/${keyMd5}`;
        return keyUrl
    }
    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return this.ctx.config.ENABLE_CAHCE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }


    public abstract getEdgeCache<Data = any>(key: string, schema?: z.ZodType<Data>): Promise<CacheResult<Data> | null>
    public abstract setEdgeCacheRaw(key: string, serialized: string, expirationAt: number): Promise<void>
    public abstract setEdgeCache<Data = any>(key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>): Promise<void>
}