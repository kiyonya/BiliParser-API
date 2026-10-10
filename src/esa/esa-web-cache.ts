import { WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "../../general/types/app";

export const esaWebCacheSetter: WebCacheSetter = async (keyUrl, key, data) => {
    const nowS = Math.floor(Date.now() / 1000)
    const maxAge = data.expirationAt - nowS
    if (maxAge <= 0) { return }
    const cacheHeaders = new Headers()
    cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
    cacheHeaders.set('X-Cache-Type', 'esa-cache')
    cacheHeaders.set('X-ExpirationAt', String(data.expirationAt))
    const jsonlikeResponse = new Response(JSON.stringify(data), {
        headers: cacheHeaders,
        status: 200
    })
    await cache.put(keyUrl.href, jsonlikeResponse)
}

export const esaWebCacheGetter: WebCacheGetter = async (keyUrl, key) => {
    const cachec = await cache.get(keyUrl.href)
    return cachec ?? null
}

export const esaWebCacheDeleter: WebCacheDeleter = async (keyUrl, key) => {
    await cache.delete(keyUrl.href)
}
