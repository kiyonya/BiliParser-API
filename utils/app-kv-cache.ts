import z from "zod";
import { AppContext, CacheResult, CacheWarp, KVCacheDeleter, KVCacheGetter, KVCacheSetter } from "../types/app";

export class AppKVCache {

    protected ctx: AppContext
    protected setter: KVCacheSetter
    protected getter: KVCacheGetter
    protected deleter: KVCacheDeleter

    constructor(ctx: AppContext, setter: KVCacheSetter, getter: KVCacheGetter, deleter: KVCacheDeleter) {
        this.ctx = ctx
        this.setter = setter
        this.getter = getter
        this.deleter = deleter
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return this.ctx.config.ENABLE_CACHE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }

    public async getKVCache<Data = any>(key: string, schema?: z.ZodType<Data>): Promise<CacheResult<Data> | null> {
        const cached = await this.getter<Data>(key)
        if (cached) {
            const nowS = Math.floor(Date.now() / 1000)
            const isExpried = nowS >= cached.expirationAt
            if (isExpried) {
                await this.deleter(key)
                return null
            }
            const data = cached.data
            const isDataValid = await this.validateSchema(data, schema)
            if (isDataValid) {
                return {
                    data: data,
                    raw: cached,
                    valid: isDataValid
                }
            }
            else {
                await this.deleter(key)
                return null
            }
        }
        return null
    }

    public async setKVCache<Data = any>(key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>): Promise<void> {
        if (!await this.validateSchema(data, schema)) { return }
        const warp: CacheWarp<Data> = {
            data: data,
            expirationAt: expirationAt,
            key: key
        }
        await this.setter(key, warp, expirationAt)
    }

    public async setKVCacheRaw(key: string, serialized: string, expirationAt: number): Promise<void> {
        const warp = JSON.parse(serialized) as CacheWarp
        await this.setter(key, warp, expirationAt)
    }

}
