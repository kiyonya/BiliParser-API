import { Hono, Next } from "hono";
import { fromHono } from "chanfana";
import { AppContext, AppLocation, KVCacheDeleter, KVCacheGetter, KVCacheSetter, WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "./types/app";

import { BaseAPI } from "./apis/base";
import { VideoCDNAPI } from "./apis/cdn";
import { CookieAPI } from "./apis/cookie";
import { IpRegionAPI } from "./apis/biliip";
import { VideoAPI } from "./apis/video";
import { DanmakuAPI } from "./apis/danmaku";
import { SubtitleAPI } from "./apis/subtitle";
import { CoverAPI } from "./apis/cover";
import { LiveAPI } from "./apis/live";
import { BangumiEpisodesAPI, BangumiInfoAPI } from "./apis/bangumi";
import { ArchieveAPI } from "./apis/archieve";
import { FavListAPI } from "./apis/favlist";
import { SearchAPI } from "./apis/search";

import { createAppCache, createAppCacheKey, createAppContext, createAppFetch, FetchImpl } from "./create";
import { AppConfig } from "./utils/app-config";

export const API_VERSION = "7.5.5"

const DEFAULT_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, HEAD',
    'Referrer-Policy': "strict-origin-when-cross-origin",
    "Access-Control-Allow-Credentials": 'true',
    'X-Nekocha': "isn't nekocha cute??",
    'X-API-Version': API_VERSION
}

export type AppMiddlewareFunction = (ctx: AppContext, next: Next) => Promise<void> | void

export interface createServerOptions {
    webCacheSetterFactory?: (ctx: AppContext) => WebCacheSetter | null | undefined,
    webCacheGetterFactory?: (ctx: AppContext) => WebCacheGetter | null | undefined,
    webCacheDeleterFactory?: (ctx: AppContext) => WebCacheDeleter | null | undefined,
    kvCacheSetterFactory?: (ctx: AppContext) => KVCacheSetter | null | undefined,
    kvCacheGetterFactory?: (ctx: AppContext) => KVCacheGetter | null | undefined,
    kvCacheDeleterFactory?: (ctx: AppContext) => KVCacheDeleter | null | undefined,
    fetchFactory?: (ctx: AppContext) => FetchImpl,
    locationFactory?: (ctx: AppContext) => AppLocation,
    deferFactory?: (ctx: AppContext) => ((p: Promise<unknown>) => void | Promise<void>),
    onResponseCache?: (ctx: AppContext, response: Response, maxAge: number) => void | Promise<void>
    middlewares?: AppMiddlewareFunction[],
    config?: AppConfig
}

export function createServer(createServerOptions: createServerOptions = {}) {
    const { webCacheSetterFactory, webCacheGetterFactory, webCacheDeleterFactory, kvCacheSetterFactory, kvCacheGetterFactory, kvCacheDeleterFactory, fetchFactory, locationFactory, deferFactory, onResponseCache: howShouldICacheResponse, middlewares, config } = createServerOptions
    const app = new Hono()
    app.use(async (c, next) => {
        const ctx = createAppContext(c, config)
        ctx.appCache = createAppCache(ctx, webCacheSetterFactory, webCacheGetterFactory, webCacheDeleterFactory, kvCacheSetterFactory, kvCacheGetterFactory, kvCacheDeleterFactory)
        ctx.appCacheKey = createAppCacheKey(ctx)
        ctx.appFetch = createAppFetch(ctx, fetchFactory?.(ctx) || fetch)
        ctx.appLocation = locationFactory?.(ctx) || {}
        ctx.defer = deferFactory?.(ctx) ||
            async function (p) {
                try {
                    await p
                } catch (error) { }
            }
        ctx.isInit = true

        await next()
    })

    app.use(async (ctx, next) => {
        if (!(ctx as unknown as AppContext).isInit) {
            throw new Error("cannot create server because context not init")
        }
        await next()
    })

    app.use(async (ctx, next) => {
        for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
            ctx.header(k, v)
        }
        await next()
        const cache = (ctx as unknown as AppContext).appCache
        if (cache) {
            for (const [k, v] of Object.entries(cache.cacheHeaders)) {
                ctx.res.headers.set(k, v)
            }
            if (cache.minExpirationTime < Infinity) {
                ctx.res.headers.set('X-Min-Expiration', String(cache.minExpirationTime))
            }
        }
    })

    app.use(async (c, next) => {
        await next()
        const ctx = c as unknown as AppContext
        if (ctx.res.headers.has('Cache-Control')) { return }
        const maxCacheTime = ctx.config.RESPONSE_MAX_CACHE_TIME
        const status = ctx.res.status
        const isResponseCacheable = ctx.config.ENABLE_RESPONSE_CACHING && maxCacheTime > 0 && [200, 302, 304, 307].includes(status) && howShouldICacheResponse

        if (isResponseCacheable) {
            const response = ctx.res
            const appCache = ctx.appCache
            const nowS = Math.floor(Date.now() / 1000)
            const minExpirationTime = appCache.minExpirationTime
            const maxCacheExpiration = nowS + maxCacheTime
            const maxExpiration = Math.min(maxCacheExpiration, minExpirationTime)
            const maxAge = Math.max(0, Math.floor(maxExpiration - nowS))

            if (response && maxAge > 0) {
                await howShouldICacheResponse(ctx, response, maxAge)
            }
        }

        if (!ctx.res.headers.has("Cache-Control")) {
            ctx.res.headers.set("Cache-Control", "no-store")
        }
    })

    if (middlewares && middlewares.length) {
        for (const func of middlewares) {
            app.use(async (c, next) => {
                const ctx = c as unknown as AppContext
                await func(ctx, next)
            })
        }
    }

    const openapi = fromHono(app, {
        docs_url: "/doc"
    });

    openapi.all('/', BaseAPI)
    openapi.get('/cdn', VideoCDNAPI)
    openapi.get('/cookie', CookieAPI)
    openapi.get('/ipregion', IpRegionAPI)
    openapi.get('/video/:id?/:p?', VideoAPI)
    openapi.get('/bangumi/info', BangumiInfoAPI)
    openapi.get('/bangumi/episodes', BangumiEpisodesAPI)
    openapi.get('/danmaku/:id?/:p?', DanmakuAPI)
    openapi.get('/subtitle/:id?/:p?', SubtitleAPI)
    openapi.get('/cover/:id?', CoverAPI)
    openapi.get('/live/:roomId?', LiveAPI)
    openapi.get('/user/archieve/:mid?/:sid?', ArchieveAPI)
    openapi.get('/user/fav/:fid?', FavListAPI)
    openapi.get('/search/:type?', SearchAPI)

    return app
}