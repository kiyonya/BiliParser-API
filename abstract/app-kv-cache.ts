import z from "zod";
import { AppContext, CacheResult } from "../types/app";

export abstract class AppKVCache {
    protected ctx: AppContext
    constructor(ctx:AppContext) {
        this.ctx = ctx
    }
    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return this.ctx.config.ENABLE_CACHE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }

    public abstract getKVCache<Data = any>( key: string, schema?: z.ZodType<Data>): Promise<CacheResult<Data> | null>

    public abstract setKVCache<Data = any>(key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>): Promise<void>

    public abstract setKVCacheRaw(key: string, serialized: string, expirationAt: number): Promise<void>

}