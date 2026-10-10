import { createServerOptions } from "../../general"
import {AppLocation } from "../../general/types/app"
import { esaWebCacheDeleter, esaWebCacheGetter, esaWebCacheSetter } from "./esa-web-cache"

export function createAppLocationFromEsa(request: Request): AppLocation {
    return {}
}

export function createEsaServer(): createServerOptions {
    const options: createServerOptions = {
        webCacheSetterFactory: () => esaWebCacheSetter,
        webCacheGetterFactory: () => esaWebCacheGetter,
        webCacheDeleterFactory: () => esaWebCacheDeleter,
        fetchFactory: () => fetch,
        locationFactory: (ctx) => {
            return createAppLocationFromEsa(ctx.req.raw)
        },
    }
    return options
}
