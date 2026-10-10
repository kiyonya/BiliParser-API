import { createServerOptions } from "../../general"
import { AppContext, AppLocation } from "../../general/types/app"
import { cfWebCacheDeleter, cfWebCacheGetter, cfWebCacheSetter } from "./cf-edge-cache"
import { createCfKVCacheDeleter, createCfKVCacheGetter, createCfKVCacheSetter } from "./cf-kv-cache"
import { createCfProxyFetch } from "./cf-proxy-fetch"

export function createAppLocationFromCf(cf?: CfProperties): AppLocation {
    return {
        city: cf?.city as string | undefined,
        continent: cf?.continent as string | undefined,
        country: cf?.country as string | undefined,
        asn: cf?.asn as string | undefined,
        colo: cf?.colo as string | undefined
    }
}

function getKVNamespace(ctx: AppContext): KVNamespace | undefined {
    //@ts-ignore
    return ctx.env[ctx.config.KV_CACHE_BINDING]
}

export function createCfServer(): createServerOptions {
    const options: createServerOptions = {
        webCacheSetterFactory: () => cfWebCacheSetter,
        webCacheGetterFactory: () => cfWebCacheGetter,
        webCacheDeleterFactory: () => cfWebCacheDeleter,
        kvCacheSetterFactory: (ctx) => {
            const kv = getKVNamespace(ctx)
            return kv ? createCfKVCacheSetter(kv) : null
        },
        kvCacheGetterFactory: (ctx) => {
            const kv = getKVNamespace(ctx)
            return kv ? createCfKVCacheGetter(kv) : null
        },
        kvCacheDeleterFactory: (ctx) => {
            const kv = getKVNamespace(ctx)
            return kv ? createCfKVCacheDeleter(kv) : null
        },
        fetchFactory: (ctx) => createCfProxyFetch(ctx),
        locationFactory: (ctx) => {
            const cf = ctx.req.raw.cf
            return createAppLocationFromCf(cf)
        },
        deferFactory: (ctx) => function (p) {
            try {
                ctx.executionCtx.waitUntil(p)
            } catch (error) { }
        }
    }
    return options
}
