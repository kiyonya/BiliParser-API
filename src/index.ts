/**
 * Biliparser-ESA
 */
import { API_VERSION, createApp } from "../api-core";
import { AppHeaders } from "../api-core/shared/headers";
import { AppConfigOptions, AppContext, AppLocation, CacheStatus, CacheWarp } from "../api-core/types/app";
import { AppCache, AppCacheLayer } from "../api-core/utils/app-cache";
import { AppConfig } from "../api-core/utils/app-config";
import { md5String } from "../api-core/utils/hashlib";
import crypto from 'node:crypto'

const LOCAL_ENV: Partial<AppConfigOptions> = {
    VIDEO_CDN_ALLOCATION: "*,CN,cos;*,HK,aliov;*,MO,aliov;*,TW,aliov;*,JP,alio1;*,KR,alio1;*,SG,cosov;*,VN,hw;*,*,aliov",
    ENABLE_COOKIE_WEB_CACHE: true,
    ENABLE_CACHE_DATA_VALIDATION: true,
    ENABLE_CACHE_LAYER_SYNC: true,
    ENABLE_RESPONSE_CACHING: false,
    ENABLE_CUSTOM_COOKIES: false,
    SERVER_VERSION: "7.9.1.261023-esa",
    CACHE_DATA_VERSION: 6,
}

enum ESAHeaders {
    ESA_CACHE_TIME = "ESA-Cache-Time",
    ESA_CACHE_TTL = "ESA-Cache-Ttl",
    ESA_CACHE_STATUS = "ESA-Cache-Status",
    ESA_CACHE_TAG = "ESA-Cache-Tag",
    ESA_RAY = "ESA-Ray",

    TEMP_CACHE_TIME = "_ESA-Cache-Time",
    TEMP_CACHE_TTL = "_ESA-Cache-Ttl",
    TEMP_STATUS_CODE = "_ESA-Status-Code",
    TEMP_STATUS_TEXT = "_ESA-Status-Text",
    TEMP_CACHE_RESPONSE = "_ESA-Cache-Response"
}

async function createEsaCacheLayers(ctx: AppContext) {
    function createVCacheKey(ctx: AppContext, cacheKey: string) {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = md5String(cacheKey);
        const keyUrl = new URL(`http://${reqUrl.hostname}`);
        keyUrl.pathname = `/esacache/${keyMd5}`;
        return keyUrl
    }
    const ESA_CACHE_HEADER = "X-ESA-Cache"

    const layers: AppCacheLayer[] = [
        AppCache.createLayer({
            layerName: "esa-web",
            layerType: "isolate",
            getter: async (ctx, key): Promise<CacheWarp | null> => {
                const keyUrl = createVCacheKey(ctx, key).toString()
                const cached: Response | undefined = await cache.get(keyUrl)
                if (cached && cached.headers.has(ESA_CACHE_HEADER)) {
                    const warp = await cached.json() as CacheWarp
                    return warp
                }
                return null
            },
            setter: async (ctx: AppContext, key: string, warp: CacheWarp): Promise<void> => {
                const keyUrl = createVCacheKey(ctx, key).toString()
                const nowS = Math.floor(Date.now() / 1000)
                const maxAge = warp.expirationAt - nowS
                if (maxAge <= 0) { return }
                const cacheHeaders = new Headers()
                cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
                cacheHeaders.set(ESA_CACHE_HEADER, "")
                const response = new Response(JSON.stringify(warp), {
                    headers: cacheHeaders,
                    status: 200
                })
                await cache.put(keyUrl, response)
            },
            deleter: async (ctx: AppContext, key: string): Promise<void> => {
                const keyUrl = createVCacheKey(ctx, key).toString()
                await cache.delete(keyUrl)
            }
        })
    ]

    const kvBinding = ctx.config.KV_CACHE_BINDING
    if (kvBinding) {
        const kv = new EdgeKV({ namespace: kvBinding })
        const kvCacheLayer = AppCache.createLayer({
            layerName: 'esa-kv',
            layerType: "consistent",
            getter: async (_, key): Promise<CacheWarp | null> => {
                return (await kv.get(key, { type: "json" }) ?? null) as CacheWarp | null
            },
            setter: async (_: AppContext, key: string, warp: CacheWarp): Promise<void> => {
                await kv.put(key, JSON.stringify(warp))
            },
            deleter: async (_: AppContext, key: string): Promise<void> => {
                await kv.delete(key)
            }
        })
        layers.push(kvCacheLayer)
    }
    return layers
}

function createEsaAppLocation(ctx: AppContext): AppLocation {
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

export default {
    async fetch(request: Request, ctx?: any, e?: Record<any, any> | undefined | null) {

        const requestStart = Date.now()
        const env = { ...LOCAL_ENV, ...e }

        const requestInfo = request.info
        let requestRay: string = crypto.randomUUID().replaceAll("-", '').slice(0, 16)
        if (requestInfo && requestInfo.ip_country_id && requestInfo.ip_region_en) {
            requestRay += `-${requestInfo.ip_country_id}[${requestInfo.ip_region_en}]`
        }

        const config: AppConfig = new AppConfig(env)
        const enableResponseCaching = config.ENABLE_RESPONSE_CACHING

        const ctagParams = {
            country: requestInfo?.ip_country_id,
            continent: "",
            apiVersion: API_VERSION,
            serverStatusHash: config.SERVER_STATUS_HASH
        }
        
        const ctag = md5String(JSON.stringify(ctagParams))
        request.meta = {
            cacheTag: ctag,
            ray: requestRay
        }

        const cacheKeyUrl = new URL(request.url)
        cacheKeyUrl.protocol = "http:"
        cacheKeyUrl.searchParams.set("__ctag", ctag)
        const cacheKey = cacheKeyUrl.toString()

        let cacheStatus: CacheStatus = 'BYPASS'
        let response: Response | null = null
        if (enableResponseCaching) {
            const esaCache: Response | undefined = await cache.get(cacheKey)
            if (esaCache) {
                const cacheAtHeader = esaCache.headers.get(ESAHeaders.TEMP_CACHE_TIME)
                const maxAgeHeader = esaCache.headers.get(ESAHeaders.TEMP_CACHE_TTL)
                if (cacheAtHeader && maxAgeHeader && esaCache.headers.has(ESAHeaders.TEMP_CACHE_RESPONSE)) {
                    const cacheAt = parseInt(cacheAtHeader)
                    const maxAge = parseInt(maxAgeHeader)
                    const now = Math.floor(Date.now() / 1000)
                    const age = Math.max(0, now - cacheAt)
                    if (age < maxAge) {
                        const storedStatus = parseInt(
                            esaCache.headers.get(ESAHeaders.TEMP_STATUS_CODE) ?? "200", 10
                        )
                        const headers = new Headers(esaCache.headers)

                        const removeHeaders = [
                            ESAHeaders.TEMP_CACHE_TIME,
                            ESAHeaders.TEMP_CACHE_TTL,
                            ESAHeaders.TEMP_STATUS_CODE,
                            ESAHeaders.TEMP_STATUS_TEXT,
                            ESAHeaders.TEMP_CACHE_RESPONSE,
                            AppHeaders.BCRYPTO_COOKIE_CACHE,
                            AppHeaders.BCRYPTO_SIGN_TIME,
                            "x-swift-savetime",
                            "x-swift-cachetime",
                            "ali-swift-global-savetime",
                            "x-site-cache-status"
                        ]

                        for (const h of removeHeaders) headers.delete(h)

                        const bodyLess = [101, 204, 205, 304].includes(storedStatus)
                        const rResponse = new Response(bodyLess ? null : esaCache.body, {
                            status: storedStatus,
                            statusText: esaCache.statusText,
                            headers,
                        })
                        rResponse.headers.set('Age', String(age))
                        if (rResponse.headers.has(AppHeaders.SERVER_CACHE_STATUS)) {
                            rResponse.headers.set(AppHeaders.SERVER_CACHE_STATUS, 'BYPASS')
                        }
                        rResponse.headers.set(ESAHeaders.ESA_CACHE_TIME, String(cacheAt))
                        rResponse.headers.set(ESAHeaders.ESA_CACHE_TTL, String(maxAge))
                        response = rResponse
                        cacheStatus = 'HIT'
                    }
                    else {
                        cacheStatus = 'EXPIRED'
                        try {
                            await cache.delete(cacheKey)
                        } catch (error) {

                        }
                    }
                }
            }
            else {
                cacheStatus = 'MISS'
            }
        }
        else {
            response = null
            cacheStatus = 'BYPASS'
        }

        if (!response) {
            const app = createApp({
                config: config,
                appCacheLayerFactory: createEsaCacheLayers,
                locationFactory: createEsaAppLocation,
                onResponseCache: async (_ctx, res, maxage) => {
                    res.headers.set('Cache-Control', `public, max-age=0, s-maxage=${maxage}`)
                },
                middlewares: [
                    async (ctx, next) => {
                        await next()
                        const serverVersion = ctx.config.SERVER_VERSION
                        const cacheVersion = ctx.config.CACHE_DATA_VERSION
                        const serverStatusHash = ctx.config.SERVER_STATUS_HASH
                        ctx.res.headers.set(AppHeaders.SERVER_VERSION, String(serverVersion))
                        ctx.res.headers.set(AppHeaders.CACHE_VERSION, String(cacheVersion))
                        ctx.res.headers.set(AppHeaders.SERVER_STATUS_HASH,String(serverStatusHash))
                    }]
            })
            response = await app.fetch(request, env, ctx ?? {})
            if (enableResponseCaching) {
                const cacheHeader = response.headers.get('Cache-Control')
                if (cacheHeader && !cacheHeader.includes('no-store') && !cacheHeader.includes("no-cache")) {

                    const matchAge =
                        cacheHeader.match(/(?:^|,)\s*s-maxage\s*=\s*(\d+)/i)?.[1] ||
                        cacheHeader.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i)?.[1] ||
                        null

                    const age = matchAge ? parseInt(matchAge) : null
                    if (age && age > 0) {
                        const status = response.status
                        const statusText = response.statusText
                        const cResponse = response.clone()
                        const cacheTime = Math.floor(Date.now() / 1000)
                        cResponse.headers.set(ESAHeaders.TEMP_CACHE_TIME, String(cacheTime))
                        cResponse.headers.set(ESAHeaders.TEMP_CACHE_TTL, String(age))
                        cResponse.headers.set(ESAHeaders.TEMP_STATUS_CODE, String(status))
                        cResponse.headers.set(ESAHeaders.TEMP_STATUS_TEXT, String(statusText))
                        cResponse.headers.set(ESAHeaders.TEMP_CACHE_RESPONSE, '')
                        await cache.put(cacheKey, cResponse)
                    }
                }
            }
        }
        const requestEnd = Date.now()
        const duration = Math.max(0, requestEnd - requestStart)
        const fResponse = response.clone()
        fResponse.headers.set(ESAHeaders.ESA_RAY, String(requestRay))
        fResponse.headers.set(ESAHeaders.ESA_CACHE_TAG, ctag)
        fResponse.headers.set(ESAHeaders.ESA_CACHE_STATUS, cacheStatus)
        fResponse.headers.set("X-Request-Duration", String(duration))
        return fResponse
    }
}