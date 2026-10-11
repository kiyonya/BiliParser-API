import { AppContext, AppLocation, KVCacheDeleter, KVCacheGetter, KVCacheSetter, WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "../general/types/app"

export const esaWebCacheSetter: WebCacheSetter = async (keyUrl, _key, data) => {
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
    await cache.put(keyUrl.toString(), jsonlikeResponse)
}

export const esaWebCacheGetter: WebCacheGetter = async (keyUrl, _key) => {
    const cachec = await cache.get(keyUrl.toString())
    return cachec ?? null
}

export const esaWebCacheDeleter: WebCacheDeleter = async (keyUrl, _key) => {
    await cache.delete(keyUrl.toString())
}

export const esaKvCacheSetter = (kv: EdgeKV | null): KVCacheSetter | null => {
    if (!kv) { return null }
    return async (key, data, _expirationAt) => {
        await kv.put(key, JSON.stringify(data))
    }
}

export const esaKvCacheGetter = (kv: EdgeKV | null): KVCacheGetter | null => {
    if (!kv) { return null }
    return async (key: string) => {
        return await kv.get(key, { type: "json" }) as any
    }
}

export const esaKvCacheDeleter = (kv: EdgeKV | null): KVCacheDeleter | null => {
    if (!kv) { return null }
    return async (key) => {
        await kv.delete(key)
    }
}

export const esaRequestLocation = (ctx: AppContext): AppLocation => {
    const request = ctx.req.raw
    const info = request.info
    if (info) {
        return {
            city: info.ip_city_en,
            continent: undefined,
            asn: undefined,
            country: info.ip_country_id,
            colo: info.ip_region_id
        }
    }
    else {
        return {
            city: "N/A",
            continent: "AS",
            country: "CN",
            colo: "N/A",
            asn: "N/A"
        }
    }
}