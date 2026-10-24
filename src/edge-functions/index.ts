import type { Config, Context } from "@netlify/edge-functions";
import { createApp } from "../../api-core/index";
import type { AppConfigOptions, AppContext, AppLocation, CacheWarp } from "../../api-core/types/app";
import { AppConfig } from "../../api-core/utils/app-config";
import { v4 } from 'uuid'
import { AppHeaders } from "../../api-core/shared/headers";
import { AppCache, AppCacheLayer } from "../../api-core/utils/app-cache";
import { md5String } from "../../api-core/utils/hashlib";
import { caches } from "@netlify/cache";

const LOCAL_ENV: Partial<AppConfigOptions> = {
    VIDEO_CDN_ALLOCATION: "*,CN,cos;*,HK,aliov;*,MO,aliov;*,TW,aliov;*,JP,alio1;*,KR,alio1;*,SG,cosov;*,VN,hw;*,*,aliov",
    ENABLE_COOKIE_WEB_CACHE: true,
    ENABLE_CACHE_DATA_VALIDATION: true,
    ENABLE_CACHE_LAYER_SYNC: true,
    ENABLE_RESPONSE_CACHING: true,
    ENABLE_CUSTOM_COOKIES: false,
    SERVER_VERSION: "7.9.1.261024-netlify",
    CACHE_DATA_VERSION: 6,
}

enum NFHeaders {
    NF_CACHE_TIME = "Nf-Cache-Time",
    NF_CACHE_TTL = "Nf-Cache-Ttl",
    NF_CACHE_STATUS = "Nf-Cache-Status",
    NF_CACHE_TAG = "Nf-Cache-Tag",
    NF_RAY = "Nf-Ray",

    TEMP_CACHE_TIME = "_Nf-Cache-Time",
    TEMP_CACHE_TTL = "_Nf-Cache-Ttl",
    TEMP_STATUS_CODE = "_Nf-Status-Code",
    TEMP_STATUS_TEXT = "_Nf-Status-Text",
    TEMP_CACHE_RESPONSE = "_Nf-Cache-Response"
}

async function createNfCacheLayers() {
    function createVCacheKey(ctx: AppContext, cacheKey: string): Request {
        const reqUrl = new URL(ctx.req.url);
        const keyMd5 = md5String(cacheKey);
        const keyUrl = new URL(`http://${reqUrl.hostname}`);
        keyUrl.pathname = `/nfcache/${keyMd5}`;
        return new Request(keyUrl, { redirect: 'manual' })
    }
    const NF_CACHE_HEADER = "X-NF-Cache"
    const cacheStorage = await caches.open("nfcache")
    const layers: AppCacheLayer[] = [
        AppCache.createLayer({
            layerName: "nf-cache",
            layerType: "isolate",
            getter: async (ctx, key): Promise<CacheWarp | null> => {
                const keyUrl = createVCacheKey(ctx, key)
                const cached: Response | undefined = await cacheStorage.match(keyUrl)
                if (cached && cached.headers.has(NF_CACHE_HEADER)) {
                    const warp = await cached.json() as CacheWarp
                    return warp
                }
                return null
            },
            setter: async (ctx: AppContext, key: string, warp: CacheWarp): Promise<void> => {
                const keyUrl = createVCacheKey(ctx, key)
                const nowS = Math.floor(Date.now() / 1000)
                const maxAge = warp.expirationAt - nowS
                if (maxAge <= 0) { return }
                const cacheHeaders = new Headers()
                cacheHeaders.set('Cache-Control', `public, max-age=${maxAge}`)
                cacheHeaders.set(NF_CACHE_HEADER, "")
                const response = new Response(JSON.stringify(warp), {
                    headers: cacheHeaders,
                    status: 200
                })
                await cacheStorage.put(keyUrl, response)
            },
            deleter: async (ctx: AppContext, key: string): Promise<void> => {
                const keyUrl = createVCacheKey(ctx, key)
                await cacheStorage.delete(keyUrl)
            }
        })
    ]
    return layers
}

export default async (request: Request, context: Context) => {
    const geo = context.geo
    const requestStart = Date.now()
    const env = { ...LOCAL_ENV, ...process.env }
    let requestRay: string = v4().replaceAll("-", "").slice(0, 16)
    if (geo.country?.code) { requestRay += `-${geo.country.code}` }

    const config = new AppConfig<AppConfigOptions>(env)
    const app = createApp({
        config: config,
        appCacheLayerFactory: createNfCacheLayers,
        deferFactory: () => context.waitUntil,
        fetchFactory: () => fetch,
        onResponseCache: async (_ctx, res, maxage) => {
            //Netlify-CDN-Cache-Control
            res.headers.set('Cache-Control', `public, s-maxage=${maxage}`)
            res.headers.set('Netlify-CDN-Cache-Control', `public, s-maxage=${maxage}`)
        },
        locationFactory: () => {
            const appLocation: AppLocation = {
                asn: '',
                continent: '',
                city: geo.city,
                country: geo.country?.code ?? "cn",
                colo: geo.city
            }
            return appLocation
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
    const response = await app.fetch(request, env)
    const requestEnd = Date.now()
    const duration = Math.max(0, requestEnd - requestStart)
    response.headers.set(NFHeaders.NF_RAY, String(requestRay))
    response.headers.set("X-Request-Duration", String(duration))

    const cdnAllocation = config.VIDEO_CDN_ALLOCATION
    const countries: string[] = []
    for (const allocation of cdnAllocation) {
        const country = allocation.area.toLowerCase()
        if (country !== '*') {
            countries.push(country)
        }
    }
    const netlifyVaryCountry = countries.join("|")
    response.headers.set('Netlify-Vary', `country=${netlifyVaryCountry}`)
    return response
};

export const config: Config = {
    path: "/*"
};
