import { Context, Handler, Hono, Next } from "hono";
import { AppContext, AppLocation, APIResponse, AppFetch, FetchOptions } from "./types/app";

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

import { AppConfig } from "./utils/app-config";
import { AppCache, AppCacheKey, AppCacheLayer } from "./utils/app-cache";
import z from "zod";
import { RouteHandler } from "./apis/api";

export const API_VERSION = "7.9.1"

const DEFAULT_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, HEAD',
    'Referrer-Policy': "strict-origin-when-cross-origin",
    "Access-Control-Allow-Credentials": 'true',
    'X-Nekocha': "isn't nekocha cute??",
    'X-API-Version': API_VERSION
}

export type AppMiddlewareFunction = (ctx: AppContext, next: Next) => Promise<void> | void
export type RequestResult = { success: true, response: Response } | { success: false, error: Error }

export function toHono<T extends RouteHandler>(api: new (...args: any[]) => T, ...args: any[]): Handler {
    const honoHandler: Handler = async (c, _next) => {
        const instance: T = new api(...args)
        const ctx = c as unknown as AppContext
        return instance.handle(ctx)
    }
    return honoHandler
}

export interface createAppOptions {
    fetchFactory?: (ctx: AppContext) => typeof fetch,
    locationFactory?: (ctx: AppContext) => AppLocation,
    deferFactory?: (ctx: AppContext) => ((p: Promise<unknown>) => void | Promise<void>),
    onResponseCache?: (ctx: AppContext, response: Response, maxAge: number) => void | Promise<void>
    appCacheLayerFactory?: (ctx: AppContext) => AppCacheLayer[] | Promise<AppCacheLayer[]>
    middlewares?: AppMiddlewareFunction[],
    config?: AppConfig
}

export function createApp(createAppOptions: createAppOptions = {}) {
    const { fetchFactory, locationFactory, deferFactory, onResponseCache: howShouldICacheResponse, middlewares, config, appCacheLayerFactory } = createAppOptions
    const app = new Hono()
    app.use(async (c, next) => {
        const ctx = createAppContext(c, config)
        const cacheLayers = appCacheLayerFactory ? await appCacheLayerFactory(ctx) : []
        ctx.appCache = new AppCache(ctx, cacheLayers)
        ctx.appCacheKey = new AppCacheKey(ctx)
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

    app.get('/', toHono(BaseAPI))
    app.get('/cdn', toHono(VideoCDNAPI))
    app.get('/cookie', toHono(CookieAPI))
    app.get('/ipregion', toHono(IpRegionAPI))
    app.get('/video/:id?/:p?', toHono(VideoAPI))
    app.get('/bangumi/info', toHono(BangumiInfoAPI))
    app.get('/bangumi/episodes', toHono(BangumiEpisodesAPI))
    app.get('/danmaku/:id?/:p?', toHono(DanmakuAPI))
    app.get('/subtitle/:id?/:p?', toHono(SubtitleAPI))
    app.get('/cover/:id?', toHono(CoverAPI))
    app.get('/live/:roomId?', toHono(LiveAPI))
    app.get('/user/archieve/:mid?/:sid?', toHono(ArchieveAPI))
    app.get('/user/fav/:fid?', toHono(FavListAPI))
    app.get('/search/:type?', toHono(SearchAPI))

    return app
}
/**
 * @deprecated
 */
export function createServer(createServerOptions: createAppOptions = {}) {
    return createApp(createServerOptions)
}

export function createAppContext(c: Context, cfg?: AppConfig): AppContext {
    const ctx = c as unknown as AppContext
    if (!ctx.config) {
        ctx.config = cfg || new AppConfig(ctx.env)
    }
    ctx.jsonResp = <Data = any>(message: string, code: number, data: Data, schema?: z.ZodType<Data>): Response => {
        if (schema) {
            const parsed = schema.safeParse(data)
            if (!parsed.success) {
                throw new Error(`response validation failed: ${parsed.error.message}`)
            }
            data = parsed.data
        }
        const response: APIResponse<Data> = {
            code: code,
            message: message ?? "",
            data: data,
        }
        const responseJson: Response = ctx.json(response, code as any)
        return responseJson
    }
    return ctx
}

export function createAppFetch(ctx: AppContext, fetchImplement: typeof fetch = fetch): AppFetch {
    const config = ctx.config
    function appFetch(request: Request, options?: FetchOptions): Promise<Response>
    function appFetch(url: string | URL, init?: RequestInit, options?: FetchOptions): Promise<Response>
    async function appFetch(
        urlOrRequest: string | URL | Request,
        initOrOptions?: RequestInit | FetchOptions,
        maybeOptions?: FetchOptions
    ): Promise<Response> {
        let url: string | URL
        let init: RequestInit | undefined
        let options: FetchOptions | undefined

        if (urlOrRequest instanceof Request) {
            url = urlOrRequest.url
            init = {
                method: urlOrRequest.method,
                headers: urlOrRequest.headers,
                signal: urlOrRequest.signal
            }
            if (urlOrRequest.body) { init.body = urlOrRequest.body }
            options = initOrOptions as FetchOptions | undefined
        } else {
            url = urlOrRequest
            init = initOrOptions as RequestInit | undefined
            options = maybeOptions
        }

        const {
            retries = config.FETCH_MAX_RETRIES,
            timeout = config.FETCH_TIMEOUT,
            initialDelay = 1000,
            maxDelay = 30000,
            backoffFactor = 2,
            retryCondition = (response: Response) => {
                return response.status >= 500 || response.status === 429
            }
        } = options || {}

        const makeRequest = async (): Promise<RequestResult> => {
            try {
                const signal = init?.signal ?? AbortSignal.timeout(timeout)
                const response = await fetchImplement(url, {
                    ...init,
                    signal: signal
                })
                return { success: true, response: response }
            } catch (error) {
                if (error instanceof Error) {
                    return { success: false, error: error }
                }
                return {
                    success: false, error: new Error(error ? String(error) : 'request failed')
                }
            }
        }

        let lastError: Error | null = null
        let delay = initialDelay
        for (let attempt = 1; attempt <= retries; attempt++) {
            const result = await makeRequest()
            if (result.success) {
                const response = result.response
                const isResponseNeedRetry = retryCondition(response)
                if (!isResponseNeedRetry) {
                    return response
                }
                else {
                    lastError = new Error(`request failed with code:${response.status}`)
                }
            }
            else {
                const error = result.error
                lastError = error
            }
            if (attempt === retries) {
                break
            }
            const jitter = Math.random() * 0.3 * delay
            await new Promise(resolve => setTimeout(resolve, delay + jitter))
            delay = Math.min(delay * backoffFactor, maxDelay)
        }

        throw (lastError instanceof Error) ? lastError : new Error("request failed")
    }
    return appFetch
}