
import { Hono } from "hono";
import { createServer } from "../api-core";
import http from 'http'
import { getRequestListener } from "@hono/node-server";
import { AppConfig } from '../api-core/utils/app-config';
import { LRUCache } from "lru-cache/raw";
import { AppCache } from "../api-core/utils/app-cache";
import { AppConfigOptions, CacheWarp } from "../api-core/types/app";

export async function startServer(port: number = 8080) {
    const config = new AppConfig<AppConfigOptions>({
        ENABLE_RESPONSE_CACHING: true,
        ENABLE_CACHE_LAYER_SYNC: true,
        ENABLE_COOKIE_WEB_CACHE: true,
        ENABLE_CACHE_DATA_VALIDATION: true,
        ENABLE_CUSTOM_COOKIES: false,
        VIDEO_CDN_ALLOCATION: "*,*,cos"
    })
    const lru = new LRUCache<string, CacheWarp>({
        max: 200
    })
    const lruCacheLayer = AppCache.createLayer({
        layerType: "any",
        layerName: "cache-lru",
        getter: (_ctx, key) => {
            const cacheWarp = lru.get(key)
            if (cacheWarp) { return cacheWarp }
        },
        setter: (_ctx, key, data) => {
            const expirationAt = data.expirationAt
            const now = Math.floor(Date.now() / 1000)
            const ttl = Math.max(0, (expirationAt - now) * 1000)
            lru.set(key, data, {
                ttl: ttl
            })
        },
        deleter: (_ctx, key) => {
            lru.delete(key)
        }
    })
    const app: Hono = createServer(
        {
            config: config,
            appCacheLayers: [lruCacheLayer],
            fetchFactory: () => fetch,
            onResponseCache: (_ctx, response, age) => {
                response.headers.set(`Cache-Control`, `public, max-age=0, s-maxage=${age}`)
            }
        }
    )
    const listener = getRequestListener(app.fetch);
    const server = http.createServer(listener);
    server.listen(port, () => {
        console.log(`HTTP server on ${port}`);
    })
    server.on('close', () => lru.clear())
    return server
}
