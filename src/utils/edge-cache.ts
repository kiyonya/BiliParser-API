
import { AppContext } from "../types";
import crypto from 'crypto'

export interface EdgeCacheWarp<Data = any> {
    data: Data,
    expirationAt: number,
    key: string
}

export default class EdgeCache {

    protected md5String(string: string) {
        return crypto.createHash('md5').update(string).digest('hex')
    }

    protected createVCacheKey(ctx: AppContext, cacheKey: string) {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = this.md5String(cacheKey);
        const keyUrl = new URL(`${reqUrl.protocol}//${reqUrl.hostname}`);
        keyUrl.pathname = `${reqUrl.pathname}/${keyMd5}`;
        return keyUrl
    }

    public async getEdgeCache<Data = any>(ctx: AppContext, key: string): Promise<{ data: Data, raw: EdgeCacheWarp<Data> } | null> {
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
                const warp = await cached.json<EdgeCacheWarp>()
                return {
                    data: warp.data,
                    raw: warp
                }
            }
            return null
        } catch (error) {
            return null
        }
    }

    public async setEdgeCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number) {
        try {
            const vCacheKey = this.createVCacheKey(ctx, key)
            const cacheHeaders = new Headers()
            const nowS = Math.floor(Date.now() / 1000)
            const maxAge = expirationAt - nowS
            if (maxAge <= 0) { return }
            cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
            cacheHeaders.set('X-Cache-Type', 'cf-vcache')
            cacheHeaders.set('X-ExpirationAt', String(expirationAt))
            const warp: EdgeCacheWarp<Data> = {
                data: data,
                expirationAt: expirationAt,
                key: key
            }
            const jsonlikeResponse = new Response(JSON.stringify(warp), {
                headers: cacheHeaders,
                status: 200
            })
            await caches.default.put(vCacheKey, jsonlikeResponse)
        } catch (error) {
            return
        }
    }
}