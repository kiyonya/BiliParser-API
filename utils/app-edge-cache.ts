import z from "zod";
import { AppContext, CacheResult, CacheWarp, WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "../types/app";
import { md5String } from "./hashlib";

export class AppWebCache {

    protected ctx: AppContext
    protected setter: WebCacheSetter
    protected getter: WebCacheGetter
    protected deleter: WebCacheDeleter

    constructor(ctx: AppContext, setter: WebCacheSetter, getter: WebCacheGetter, deleter: WebCacheDeleter) {
        this.ctx = ctx
        this.setter = setter
        this.getter = getter
        this.deleter = deleter
    }

    protected createVCacheKey(ctx: AppContext, cacheKey: string) {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = md5String(cacheKey);
        const keyUrl = new URL(`${reqUrl.protocol}//${reqUrl.hostname}`);
        keyUrl.pathname = `/edgecache/${keyMd5}`;
        return keyUrl
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return this.ctx.config.ENABLE_CAHCE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }

    public async getEdgeCache<Data = any>(key: string, schema?: z.ZodType<Data>): Promise<CacheResult<Data> | null> {
        try {
            const keyUrl = this.createVCacheKey(this.ctx, key)
            const cached = await this.getter<Data>(keyUrl, key)
            if (cached) {
                const cacheExpritionAt = cached.headers.get('X-ExpirationAt')?.trim()
                if (!cacheExpritionAt) {
                    return null
                }
                const nowS = Math.floor(Date.now() / 1000)
                const isExpried = nowS >= parseInt(cacheExpritionAt)
                if (isExpried) {
                    await this.deleter(keyUrl, key)
                    return null
                }
                const warp = await cached.json() as CacheWarp<Data>
                const data = warp.data
                const isDataValid = await this.validateSchema(data, schema)
                if (isDataValid) {
                    return {
                        data: data,
                        raw: warp,
                        valid: isDataValid
                    }
                }
                else {
                    await this.deleter(keyUrl, key)
                    return null
                }
            }
            return null
        } catch (error) {
            return null
        }
    }

    public async setEdgeCacheRaw(key: string, serialized: string, expirationAt: number) {
        try {
            const keyUrl = this.createVCacheKey(this.ctx, key)
            const warp = JSON.parse(serialized) as CacheWarp
            await this.setter(keyUrl, key, warp)
        } catch (error) {
            return
        }
    }

    public async setEdgeCache<Data = any>(key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>) {
        try {
            if (!await this.validateSchema(data, schema)) { return }
            const warp: CacheWarp<Data> = {
                data: data,
                expirationAt: expirationAt,
                key: key
            }
            const keyUrl = this.createVCacheKey(this.ctx, key)
            await this.setter(keyUrl, key, warp)
        } catch (error) {
            return
        }
    }
}
