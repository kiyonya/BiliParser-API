
import { Config } from "../shared/config";
import { AppContext, CacheResult, CacheWarp } from "../types";
import z from "zod";
import { md5String } from "./hashlib";

export default class EdgeCache {

    protected createVCacheKey(ctx: AppContext, cacheKey: string) {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = md5String(cacheKey);
        const keyUrl = new URL(`${reqUrl.protocol}//${reqUrl.hostname}`);
        keyUrl.pathname = `/edgecache/${keyMd5}`;
        return keyUrl
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return Config.ENABLE_CAHCE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }

    public async getEdgeCache<Data = any>(ctx: AppContext, key: string, schema?: z.ZodType<Data>): Promise<CacheResult | null> {
        try {
            const vCacheKey = this.createVCacheKey(ctx, key)
            const cached = await caches.default.match(vCacheKey)
            if (cached) {
                const cacheExpritionAt = cached.headers.get('X-ExpirationAt')?.trim()
                if (!cacheExpritionAt) {
                    return null
                }
                const nowS = Math.floor(Date.now() / 1000)
                const isExpried = nowS >= parseInt(cacheExpritionAt)
                if (isExpried) {
                    await caches.default.delete(vCacheKey)
                    return null
                }
                const warp = await cached.json<CacheWarp>()
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
                    await caches.default.delete(vCacheKey)
                    return null
                }
            }
            return null
        } catch (error) {
            return null
        }
    }

    public async setEdgeCacheRaw(ctx: AppContext, key: string, serialized: string, expirationAt: number) {
        try {
            const vCacheKey = this.createVCacheKey(ctx, key)
            const cacheHeaders = new Headers()
            const nowS = Math.floor(Date.now() / 1000)
            const maxAge = expirationAt - nowS
            if (maxAge <= 0) { return }
            cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
            cacheHeaders.set('X-Cache-Type', 'cf-vcache')
            cacheHeaders.set('X-ExpirationAt', String(expirationAt))
            const jsonlikeResponse = new Response(serialized, {
                headers: cacheHeaders,
                status: 200
            })
            await caches.default.put(vCacheKey, jsonlikeResponse)
        } catch (error) {
            return
        }
    }

    public async setEdgeCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>) {
        try {
            if (!await this.validateSchema(data, schema)) { return }
            const warp: CacheWarp<Data> = {
                data: data,
                expirationAt: expirationAt,
                key: key
            }
            await this.setEdgeCacheRaw(ctx, key, JSON.stringify(warp), expirationAt)
        } catch (error) {
            return
        }
    }
}