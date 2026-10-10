import { WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "../../general/types/app";

export const cfWebCacheSetter: WebCacheSetter = async (keyUrl, key, data) => {
    const nowS = Math.floor(Date.now() / 1000)
    const maxAge = data.expirationAt - nowS
    if (maxAge <= 0) { return }
    const cacheHeaders = new Headers()
    cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
    cacheHeaders.set('X-Cache-Type', 'cf-vcache')
    cacheHeaders.set('X-ExpirationAt', String(data.expirationAt))
    const jsonlikeResponse = new Response(JSON.stringify(data), {
        headers: cacheHeaders,
        status: 200
    })
    await caches.default.put(keyUrl, jsonlikeResponse)
}

export const cfWebCacheGetter: WebCacheGetter = async (keyUrl, key) => {
    return await caches.default.match(keyUrl) ?? null
}

export const cfWebCacheDeleter: WebCacheDeleter = async (keyUrl, key) => {
    await caches.default.delete(keyUrl)
}
