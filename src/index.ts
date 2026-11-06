/**
 * Biliparser-ESA
 */
import { API_VERSION, createApp } from "../api-core";
import { ManualResponseCache } from "../api-core/misc/manual-cache";
import { AppHeaders } from "../api-core/shared/headers";
import { AppConfigOptions, AppContext, AppLocation, CacheStatus, CacheWarp } from "../api-core/types/app";
import { AppCache, AppCacheLayer } from "../api-core/utils/app-cache";
import { AppConfig } from "../api-core/utils/app-config";
import { md5String } from "../api-core/utils/hashlib";
import { v4 } from 'uuid'

const LOCAL_ENV: Partial<AppConfigOptions> = {
    VIDEO_CDN_ALLOCATION: "*,CN,cos;*,HK,aliov;*,MO,aliov;*,TW,aliov;*,JP,alio1;*,KR,alio1;*,SG,cosov;*,VN,hw;*,*,aliov",
    ENABLE_COOKIE_WEB_CACHE: true,
    ENABLE_CACHE_DATA_VALIDATION: true,
    ENABLE_CACHE_LAYER_SYNC: true,
    ENABLE_RESPONSE_CACHING: true,
    ENABLE_CUSTOM_COOKIES: false,
    SERVER_VERSION: "8.0.0-261106-esa",
    CACHE_DATA_VERSION: 6,
}

enum ESAHeaders {
    ESA_CACHE_TIME = "ESA-Cache-Time",
    ESA_CACHE_TTL = "ESA-Cache-Ttl",
    ESA_CACHE_STATUS = "ESA-Cache-Status",
    ESA_CACHE_TAG = "ESA-Cache-Tag",
    ESA_RAY = "ESA-Ray",
    ESA_CACHE_TYPE = "ESA-Cache-Type",
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
        const requestInfo = request.info
        let requestRay: string = v4().replaceAll("-", '').slice(0, 16)
        if (requestInfo && requestInfo.ip_country_id && requestInfo.ip_region_en) {
            requestRay += `-${requestInfo.ip_country_id}[${requestInfo.ip_region_en}]`
        }

        try {
            const env = { ...LOCAL_ENV, ...e }
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

            const manualCache = new ManualResponseCache({
                setter: (key, response) => cache.put(key.href, response),
                getter: (key) => cache.get(key.href),
                deleter: (key) => cache.delete(key.href),
                shouldCacheResponse: (status) => status >= 200 && status < 400
            })

            if (enableResponseCaching) {
                const cache = await manualCache.get(cacheKey, {
                    headerModifier(headers, cacheAt, maxage) {
                        if (headers.has(AppHeaders.SERVER_CACHE_STATUS)) {
                            headers.set(AppHeaders.SERVER_CACHE_STATUS, 'BYPASS')
                        }
                        headers.set(ESAHeaders.ESA_CACHE_TIME, String(cacheAt))
                        headers.set(ESAHeaders.ESA_CACHE_TTL, String(maxage))
                        return headers
                    },
                    removeHeaders: [
                        "x-swift-savetime",
                        "x-swift-cachetime",
                        "ali-swift-global-savetime",
                        "x-site-cache-status",
                        AppHeaders.BCRYPTO_COOKIE_CACHE,
                        AppHeaders.BCRYPTO_SIGN_TIME
                    ],
                    deleteExpired: true
                })
                if (cache) {
                    response = cache
                    cacheStatus = 'HIT'
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
                    shouldResponseCache: (ctx, status) => {
                        const method = ctx.req.method
                        return (method === 'GET' || method === 'HEAD')  && status >= 200 && status < 400
                    },
                    setResponseCacheHeaders: (_, maxage) => {
                        return {
                            'cache-control': `public, s-maxage=${maxage}`
                        }
                    },
                    middlewares: [
                        async (ctx, next) => {
                            await next()
                            const serverVersion = ctx.config.SERVER_VERSION
                            const cacheVersion = ctx.config.CACHE_DATA_VERSION
                            const serverStatusHash = ctx.config.SERVER_STATUS_HASH
                            ctx.res.headers.set(AppHeaders.SERVER_VERSION, String(serverVersion))
                            ctx.res.headers.set(AppHeaders.CACHE_VERSION, String(cacheVersion))
                            ctx.res.headers.set(AppHeaders.SERVER_STATUS_HASH, String(serverStatusHash))
                        }]
                })
                response = await app.fetch(request, env, ctx ?? {})
                await manualCache.put(cacheKey, response.clone())
            }
            const requestEnd = Date.now()
            const duration = Math.max(0, requestEnd - requestStart)
            response.headers.set(ESAHeaders.ESA_RAY, String(requestRay))
            response.headers.set(ESAHeaders.ESA_CACHE_TAG, ctag)
            response.headers.set(ESAHeaders.ESA_CACHE_STATUS, cacheStatus)
            response.headers.set("X-Request-Duration", String(duration))
            return response
        } catch (error) {
            const message = (error as Error)?.message ?? "Internel Server Error"
            return new Response(message, {
                status: 500
            })
        }
    }
}