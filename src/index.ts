import { API_VERSION, createServer } from "../general";
import { AppHeaders } from "../general/shared/headers";
import { CacheStatus } from "../general/types/app";
import { AppConfig } from "../general/utils/app-config";
import { md5String } from "../general/utils/hashlib";
import { esaKvCacheDeleter, esaKvCacheGetter, esaKvCacheSetter, esaRequestLocation, esaWebCacheDeleter, esaWebCacheGetter, esaWebCacheSetter } from "./esa";
import crypto from 'node:crypto'

const LOCAL_ENV: Record<string, any> = {
    VIDEO_CDN_ALLOCATION: "*,CN,cos;*,HK,aliov;*,MO,aliov;*,TW,aliov;*,JP,alio1;*,KR,alio1;*,SG,cosov;*,VN,hw;*,*,aliov",
    ENABLE_COOKIE_WEB_CACHE: true,
    ENABLE_CACHE_DATA_VALIDATION: true,
    ENABLE_RESPONSE_CACHING: true,
    ENABLE_CUSTOM_COOKIES: false,
    ENABLE_PROXY_SERVER: false,
    SERVER_VERSION: "7.5.0.261013-esa",
    CACHE_DATA_VERSION: 6,
}

enum ESAHeaders {
    ESA_CACHE_TIME = "ESA-Cache-Time",
    ESA_CACHE_MAXAGE = "ESA-Cache-Savetime",
    ESA_CACHE_STATUS = "ESA-Cache-Status",
    ESA_CACHE_TAG = "ESA-Cache-Tag",
    ESA_RAY = "ESA-Ray",

    TEMP_CACHE_TIME = "_ESA-Cache-Time",
    TEMP_CACHE_SAVETIME = "_ESA-Cache-Savetime",
    TEMP_STATUS_CODE = "_ESA-Status-Code",
    TEMP_STATUS_TEXT = "_ESA-Status-Text",
    TEMP_CACHE_RESPONSE = "_ESA-Cache-Response"
}

export default {
    async fetch(request: Request, ctx?: any, e?: any) {

        const requestStart = Date.now()
        const env = e ?? LOCAL_ENV ?? {}

        const reqInfo = request.info

        let requestRay: string = md5String(crypto.randomUUID()).slice(0, 16)
        if (reqInfo && reqInfo.ip_country_id && reqInfo.ip_region_en) {
            requestRay += `-${reqInfo.ip_country_id}[${reqInfo.ip_region_en}]`
        }

        const ctagParams = {
            country: reqInfo?.ip_country_id,
            continent: "",
            loginHash: `${env.ENABLE_CUSTOM_COOKIES},${env.CUSTOM_COOKIES}`,
            cacheVersion: env.CACHE_DATA_VERSION,
            serverVersion: env.SERVER_VERSION,
            apiVersion: API_VERSION
        }

        const ctag = md5String(JSON.stringify(ctagParams))

        request.meta = {
            cacheTag: ctag,
            ray: requestRay
        }

        const cacheKeyUrl = new URL(request.url)
        // important!
        cacheKeyUrl.protocol = "http:"
        cacheKeyUrl.searchParams.set("__ctag", ctag)


        const config: AppConfig = new AppConfig(env)
        const enableResponseCaching = config.ENABLE_RESPONSE_CACHING

        let cacheStatus: CacheStatus = 'BYPASS'
        let response: Response | null = null

        if (enableResponseCaching) {
            const esaCache: Response | undefined = await cache.get(cacheKeyUrl.toString())
            if (esaCache) {
                const cacheAtHeader = esaCache.headers.get(ESAHeaders.TEMP_CACHE_TIME)
                const maxAgeHeader = esaCache.headers.get(ESAHeaders.TEMP_CACHE_SAVETIME)
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
                            ESAHeaders.TEMP_CACHE_SAVETIME,
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
                        if (rResponse.headers.has(AppHeaders.SERVER_CACHE_KV)) {
                            rResponse.headers.set(AppHeaders.SERVER_CACHE_KV, 'BYPASS')
                        }
                        if (rResponse.headers.has(AppHeaders.SERVER_CACHE_WEB)) {
                            rResponse.headers.set(AppHeaders.SERVER_CACHE_WEB, 'BYPASS')
                        }
                        rResponse.headers.set(ESAHeaders.ESA_CACHE_TIME, String(cacheAt))
                        rResponse.headers.set(ESAHeaders.ESA_CACHE_MAXAGE, String(maxAge))
                        response = rResponse
                        cacheStatus = 'HIT'
                    }
                    else {
                        cacheStatus = 'EXPIRED'
                        try {
                            await cache.delete(cacheKeyUrl.toString())
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
            let kv: EdgeKV | null = null
            if (env?.KV_CACHE_BINDING) {
                kv = new EdgeKV({ namespace: env.KV_CACHE_BINDING })
            }
            const app = createServer({
                config: config,
                webCacheSetterFactory: () => esaWebCacheSetter,
                webCacheGetterFactory: () => esaWebCacheGetter,
                webCacheDeleterFactory: () => esaWebCacheDeleter,
                kvCacheSetterFactory: () => esaKvCacheSetter(kv),
                kvCacheGetterFactory: () => esaKvCacheGetter(kv),
                kvCacheDeleterFactory: () => esaKvCacheDeleter(kv),
                locationFactory: (ctx) => esaRequestLocation(ctx),
                onResponseCache: async (_ctx, res, maxage) => {
                    res.headers.set('Cache-Control', `public, max-age=0, s-maxage=${maxage}`)
                },
                middlewares: [
                    async (ctx, next) => {
                        await next()
                        const serverVersion = ctx.config.SERVER_VERSION
                        const cacheVersion = ctx.config.CACHE_DATA_VERSION
                        const isServerLogin = ctx.config.IS_SERVER_LOGIN
                        ctx.res.headers.set(AppHeaders.SERVER_VERSION, String(serverVersion))
                        ctx.res.headers.set(AppHeaders.CACHE_VERSION, String(cacheVersion))
                        ctx.res.headers.set(AppHeaders.SERVER_ONLINE, String(isServerLogin))
                        ctx.res.headers.set("X-Service", "biliapi-esa")

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
                        cResponse.headers.set(ESAHeaders.TEMP_CACHE_SAVETIME, String(age))
                        cResponse.headers.set(ESAHeaders.TEMP_STATUS_CODE, String(status))
                        cResponse.headers.set(ESAHeaders.TEMP_STATUS_TEXT, String(statusText))
                        cResponse.headers.set(ESAHeaders.TEMP_CACHE_RESPONSE, '')
                        await cache.put(cacheKeyUrl.toString(), cResponse)
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