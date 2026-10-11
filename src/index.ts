import { createServer } from "../general";
import { esaKvCacheDeleter, esaKvCacheGetter, esaKvCacheSetter, esaRequestLocation, esaWebCacheDeleter, esaWebCacheGetter, esaWebCacheSetter } from "./esa";

const LOCAL_ENV: Record<string, any> = {
    VIDEO_CDN_ALLOCATION: "*,CN,cos;*,HK,aliov;*,MO,aliov;*,TW,aliov;*,JP,alio1;*,KR,alio1;*,SG,cosov;*,VN,hw;*,*,aliov",
    ENABLE_CACHE_DATA_VALIDATION: true,
    ENABLE_RESPONSE_CACHING: false,
    ENABLE_CUSTOM_COOKIES: false,
    ENABLE_PROXY_SERVER: false,
    SERVER_VERSION: "7.2.0.261011-esa",
    CACHE_DATA_VERSION: 6,
    KV_CACHE_BINDING: "bili-cache-kv-esa",
}

export default {
    async fetch(request: Request, ctx?: any, e?: any) {
        const env = e ?? LOCAL_ENV ?? {}
        let kv: EdgeKV | null = null
        if (env?.KV_CACHE_BINDING) {
            kv = new EdgeKV({ namespace: env.KV_CACHE_BINDING })
        }

        const app = createServer({
            webCacheSetterFactory: () => esaWebCacheSetter,
            webCacheGetterFactory: () => esaWebCacheGetter,
            webCacheDeleterFactory: () => esaWebCacheDeleter,
            kvCacheSetterFactory: () => esaKvCacheSetter(kv),
            kvCacheGetterFactory: () => esaKvCacheGetter(kv),
            kvCacheDeleterFactory: () => esaKvCacheDeleter(kv),
            locationFactory:(ctx)=>esaRequestLocation(ctx),
            middlewares: [async (ctx, next) => {
                const requestStart = Date.now()
                await next()
                const requestEnd = Date.now()
                const duration = requestEnd - requestStart
                const serverVersion = ctx.config.SERVER_VERSION
                const cacheVersion = ctx.config.CACHE_DATA_VERSION
                const isServerLogin = ctx.config.IS_SERVER_LOGIN

                ctx.res.headers.set("X-Server-Version", String(serverVersion))
                ctx.res.headers.set("X-Cache-Version", String(cacheVersion))
                ctx.res.headers.set("X-Service", "biliapi-esa")
                ctx.res.headers.set('X-Server-Online', String(isServerLogin))
                ctx.res.headers.set("X-Request-Duration", String(duration))
            }]
        })

        return app.fetch(request, env ?? LOCAL_ENV ?? {}, ctx ?? {})
    }
}