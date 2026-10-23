import { Context, Env, Input } from "hono"
import { AppCache, AppCacheKey } from "../utils/app-cache"
import { AppConfig } from "../utils/app-config"
import z from "zod"

export type CacheStatus = "HIT" | "BYPASS" | "MISS" | "EXPIRED" | "DYNAMIC"

export interface FetchOptions {
    retries?: number
    initialDelay?: number
    maxDelay?: number
    backoffFactor?: number
    timeout?: number
    retryCondition?: (response: Response) => boolean
}

export interface AppFetch {
    (request: Request, options?: FetchOptions): Promise<Response>
    (url: string | URL, init?: RequestInit, options?: FetchOptions): Promise<Response>
}

export interface ContextInject {
    appCache: AppCache,
    config: AppConfig,
    appCacheKey: AppCacheKey
    jsonResp: <Data = any>(message: string, code: number, data: Data, schema?: z.ZodType<Data>) => Response,
    defer: (p: Promise<unknown>) => void | Promise<void>
    appFetch: AppFetch,
    appLocation: AppLocation
    isInit?: boolean
}

export interface CDNAllocation {
    continent: string
    area: string
    cdn: string
    priority: number
}

export type AppContext<
    E extends Partial<Record<any, any>> = Partial<Record<any, any>>,
    P extends string = string,
    I extends Input = {},
> = Context<E, P, I> & ContextInject

export interface CacheWarp<Data = any> {
    data: Data,
    expirationAt: number,
    key: string
}
export interface CacheResult<Data = any> {
    data: Data,
    raw: CacheWarp<Data>,
    valid: boolean
}

export type WebCacheSetter = <Data>(keyUrl: URL, key: string, data: Response, expirationAt: number, ttl: number) => Promise<void>;
export type WebCacheGetter = <Data>(keyUrl: URL, key: string) => Promise<Response | null>;
export type WebCacheDeleter = (keyUrl: URL, key: string) => Promise<void>;

export type KVCacheSetter = <Data>(key: string, data: string, expirationAt: number) => Promise<void>;
export type KVCacheGetter = <Data>(key: string) => Promise<CacheWarp<Data> | null>;
export type KVCacheDeleter = (key: string) => Promise<void>;


export type CacheSetter = <Data = any>(ctx: AppContext, key: string, data: CacheWarp<Data>) => void | Promise<void>
export type CacheGetter = <Data = any>(ctx: AppContext, key: string) => null | CacheWarp<Data> | Promise<null | CacheWarp<Data>> | void | Promise<void>
export type CacheDeleter = (ctx: AppContext, key: string) => void | Promise<void>
export type CacheLayerType = "consistent" | "isolate" | "any"

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time?: number,
    data: Data,
}

export interface AppLocation {
    colo?: string,
    continent?: string,
    country?: string,
    asn?: string,
    city?: string
}

export interface AppConfigOptions {
    SERVER_VERSION: string | undefined
    IS_SERVER_LOGIN: boolean
    VIDEO_CDN_ALLOCATION: string
    VIDEO_CDN: Record<string, string>
    ENABLE_CACHE_DATA_VALIDATION: boolean
    ENABLE_CACHE_LAYER_SYNC: boolean
    CACHE_DATA_VERSION: number
    ENABLE_RESPONSE_CACHING: boolean
    RESPONSE_MAX_CACHE_TIME: number
    KV_CACHE_BINDING: string | undefined
    ENABLE_CUSTOM_COOKIES: boolean
    COOKIES_SIGN_CACHE_TIME: number
    CUSTOM_COOKIES: string | undefined
    ENABLE_COOKIE_WEB_CACHE: boolean
    BILI_VIDEO_PLAYURL_CACHE_TIME: number
    BILI_VIDEO_INFO_CACHE_TIME: number
    BILI_VIDEO_SUBTITLES_CACHE_TIME: number
    BILI_LIVE_CACHE_TIME: number
    BILI_BANGUMI_PLAYURL_CACHE_TIME: number
    BILI_BANGUMI_EPISODES_CACHE_TIME: number
    BILI_BANGUMI_INFO_CACHE_TIME: number
    BILI_USER_ARCHIVE_CACHE_TIME: number
    BILI_USER_FAV_CACHE_TIME: number
    BILI_DANMAKU_CACHE_TIME: number
    FETCH_MAX_RETRIES: number
    FETCH_TIMEOUT: number
    BILI_SEARCH_CACHE_TIME: number
}