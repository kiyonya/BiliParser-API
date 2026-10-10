import { Context } from "hono"
import z from "zod"

import { APIResponse, AppContext, AppFetch, FetchOptions, KVCacheDeleter, KVCacheGetter, KVCacheSetter, WebCacheDeleter, WebCacheGetter, WebCacheSetter } from "./types/app"
import { AppCache, AppCacheKey } from "./utils/app-cache"
import { AppConfig } from "./utils/app-config"
import { AppWebCache } from "./utils/app-edge-cache"
import { AppKVCache } from "./utils/app-kv-cache"

export function createAppContext(c: Context): AppContext {
    const ctx = c as unknown as AppContext
    if (!ctx.config) {
        ctx.config = new AppConfig(ctx.env)
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
    ctx.defer = (promise: Promise<any>) => {
        try {
            ctx.executionCtx.waitUntil(promise)
        } catch (error) { }
    }
    return ctx
}

export function createAppCacheKey(ctx: AppContext): AppCacheKey {
    return new AppCacheKey(ctx)
}

export function createAppCache(
    ctx: AppContext,
    webCacheSetterFactory?: (ctx: AppContext) => WebCacheSetter | null | undefined,
    webCacheGetterFactory?: (ctx: AppContext) => WebCacheGetter | null | undefined,
    webCacheDeleterFactory?: (ctx: AppContext) => WebCacheDeleter | null | undefined,
    kvCacheSetterFactory?: (ctx: AppContext) => KVCacheSetter | null | undefined,
    kvCacheGetterFactory?: (ctx: AppContext) => KVCacheGetter | null | undefined,
    kvCacheDeleterFactory?: (ctx: AppContext) => KVCacheDeleter | null | undefined
): AppCache {
    const webCacheSetter = webCacheSetterFactory?.(ctx) || undefined
    const webCacheGetter = webCacheGetterFactory?.(ctx) || undefined
    const webCacheDeleter = webCacheDeleterFactory?.(ctx) || undefined
    const kvCacheSetter = kvCacheSetterFactory?.(ctx) || undefined
    const kvCacheGetter = kvCacheGetterFactory?.(ctx) || undefined
    const kvCacheDeleter = kvCacheDeleterFactory?.(ctx) || undefined

    const edgeCache = (webCacheSetter && webCacheGetter && webCacheDeleter)
        ? new AppWebCache(ctx, webCacheSetter, webCacheGetter, webCacheDeleter)
        : undefined
    const kvCache = (kvCacheSetter && kvCacheGetter && kvCacheDeleter)
        ? new AppKVCache(ctx, kvCacheSetter, kvCacheGetter, kvCacheDeleter)
        : undefined

    return new AppCache(ctx, edgeCache, kvCache)
}

export type FetchImpl = typeof fetch

export function createAppFetch(ctx: AppContext, fetchImplement: FetchImpl = fetch): AppFetch {
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
            retries = config.PROXY_SERVER_FETCH_MAX_RETRIES,
            timeout = config.PROXY_SERVER_TIMEOUT,
            initialDelay = 1000,
            maxDelay = 30000,
            backoffFactor = 2,
            retryCondition = (response: Response) => {
                return response.status >= 500 || response.status === 429
            }
        } = options || {}

        const makeRequest = async (): Promise<Response | Error> => {
            try {
                const signal = init?.signal ?? AbortSignal.timeout(timeout)
                const response = await fetchImplement(url, {
                    ...init,
                    signal: signal
                })
                return response
            } catch (error) {
                if (error instanceof Error) { return error }
                return new Error(error ? String(error) : 'request failed')
            }
        }

        let lastError: Error | null = null
        let delay = initialDelay
        for (let attempt = 1; attempt <= retries; attempt++) {
            const result = await makeRequest()
            if (result instanceof Response) {
                const isResponseNeedRetry = retryCondition(result)
                if (!isResponseNeedRetry) {
                    return result
                }
                else {
                    lastError = new Error(`request failed with code:${result.status}`)
                }
            }
            else {
                lastError = result
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