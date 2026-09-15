import { fromHono } from "chanfana";
import { Context, Hono, Next } from "hono";
import { BiliVideoRoute } from "./routes/video";
import { BiliLiveRoute } from "./routes/live";
import { BiliBangumiEpisodesRoute, BiliBangumiInfoRoute } from "./routes/bangumi";
import { BiliIpRegionRoute } from "./routes/biliip";
import { BiliArchieveRoute } from "./routes/archieve";
import { BiliFavListRoute } from "./routes/favlist";
import { BiliVideoCDNRoute } from "./routes/cdn";
import { BiliCoverRoute } from "./routes/cover";
import { BaseRoute } from "./routes/base";
import { BiliDanmakuRoute } from "./routes/danmaku";
import { SubtitleRoute } from "./routes/subtitle";
import { SearchRoute } from "./routes/search";
import CacheableObject from "./utils/cache";
import { AppContext, ContextInject } from "./types";
import { APIResponse } from "./utils/api-route";
import z from "zod";
import { Config } from "./config";

const DEFAULT_HEADERS: Record<string, string> = {
    'Cache-Control': "no-cache",
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export type HonoContext = Context<{ Bindings: Env }, "*", any>
export type HonoContextInjected = HonoContext & ContextInject & AppContext

async function appContext(ctx: HonoContext, next: Next) {
    const mctx = ctx as HonoContextInjected
    const cache = new CacheableObject(mctx)
    mctx.cache = cache
    mctx.jsonResp = <Data = any>(message: string, code: number, data: Data, schema?: z.ZodType<Data>): Response => {
        if (schema) {
            const parsed = schema.safeParse(data)
            if (!parsed.success) {
                throw new Error(`response validation failed: ${parsed.error.message}`)
            }
            data = parsed.data as Data
        }
        const response: APIResponse<Data> = {
            code: code,
            message: message ?? "",
            data: data,
            time: Date.now()
        }
        const responseJson: Response = mctx.json(response, code as any)
        return responseJson
    }
    for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
        ctx.header(k, v)
    }
    await next()
}

async function responseHeaders(ctx: HonoContext, next: Next) {
    await next()
    const cache = (ctx as HonoContextInjected).cache
    for (const [k, v] of Object.entries(cache.cacheHeaders)) {
        ctx.res.headers.set(k, v)
    }
    ctx.res.headers.set('X-Cache-Version', String(Config.CACHE_DATA_VERSION))
    ctx.res.headers.set('X-Server-Version', String(process.env.SERVER_VERSION))
    ctx.res.headers.set('X-Nekocha', process.env.MOTD ?? "is nekocha cute?")
    ctx.res.headers.set('X-Server-Online', String(Config.IS_SERVER_LOGIN))
    if (cache.minExpirationTime < Infinity) {
        ctx.res.headers.set('X-Min-Expiration', String(cache.minExpirationTime))
    }
}

async function ctagCache(ctx: HonoContext, next: Next) {
    await next()
    if (!Config.RESPONSE_WORKER_CACHING) { return }
    const url = new URL(ctx.req.url)
    const ctag = url.searchParams.get("__ctag")
    const cacheTime = Config.RESPONSE_CACHE_TIME ?? 0
    if (!ctag || !cacheTime || cacheTime <= 0 || ![200, 302, 304, 307].includes(ctx.res.status)) {
        return
    }
    const cache = (ctx as HonoContextInjected).cache
    const minExpirationTime = cache.minExpirationTime
    const nowS = Math.floor(Date.now() / 1000)
    const maxCacheTime = minExpirationTime - nowS
    const maxAge = Math.max(0, Math.floor(Math.min(cacheTime, maxCacheTime)))
    if (maxAge <= 0) {
        ctx.res.headers.set('Cache-Control', 'no-store')
        return
    }
    const staleWhileRevalidate = Math.max(0, Math.floor(Math.min(Config.RESPONSE_CACHE_STALE_WHILE_REVALIDATE, maxAge)))
    const cacheControl = staleWhileRevalidate > 0
        ? `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
        : `public, max-age=${maxAge}`
    ctx.res.headers.set('Cache-Control', cacheControl)
    ctx.res.headers.set("X-Ctag", ctag)
}

const app = new Hono<{ Bindings: Env }>();

app.use(appContext)
app.use(responseHeaders)
app.use(ctagCache)

const openapi = fromHono(app, {
    docs_url: "/doc"
});

openapi.all('/', BaseRoute)
openapi.get('/danmaku/:bvid?/:p?', BiliDanmakuRoute)
openapi.get('/video/:bvid?/:p?', BiliVideoRoute)
openapi.get('/subtitle/:bvid?/:p?', SubtitleRoute)
openapi.get('/cover/:bvid?', BiliCoverRoute)
openapi.get('/cdn', BiliVideoCDNRoute)
openapi.get('/live/:roomId?', BiliLiveRoute)
openapi.get('/bangumi/info', BiliBangumiInfoRoute)
openapi.get('/bangumi/episodes', BiliBangumiEpisodesRoute)
openapi.get('/ipregion', BiliIpRegionRoute)
openapi.get('/user/archieve/:mid?/:sid?', BiliArchieveRoute)
openapi.get('/user/fav/:fid?', BiliFavListRoute)
openapi.get('/search/:type?', SearchRoute)

export default app