import { Context } from "hono"
import { AppCache, AppCacheKey } from "../utils/app-cache"
import { AppConfig } from "../utils/app-config"
import z from "zod"

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
    defer: (p:Promise<unknown>)=>void | Promise<void>
    appFetch: AppFetch,
    appLocation:AppLocation
    isInit?: boolean
}

export interface CDNAllocation {
    continent: string
    area: string
    cdn: string
    priority: number
}

export type AppContext<Env extends Record<any,any> = any> = Context<{ Bindings: Env }> & ContextInject

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

export type WebCacheSetter = <Data>(keyUrl: URL, key: string, data: CacheWarp<Data>) => Promise<void>;
export type WebCacheGetter = <Data>(keyUrl: URL, key: string) => Promise<Response | null>;
export type WebCacheDeleter = (keyUrl: URL, key: string) => Promise<void>;

export type KVCacheSetter = <Data>(key: string, data: CacheWarp<Data>, expirationAt: number) => Promise<void>;
export type KVCacheGetter = <Data>(key: string) => Promise<CacheWarp<Data> | null>;
export type KVCacheDeleter = (key: string) => Promise<void>;

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time?: number,
    data: Data,
}

export interface AppLocation {
    colo?:string,
    continent?:string,
    country?:string,
    asn?:string,
    city?:string
}
