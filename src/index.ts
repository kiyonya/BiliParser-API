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
	'Cache-Control': 'no-cache, no-store, must-revalidate',
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export type HonoContext = Context<{ Bindings: Env }, "*", any>
export type HonoContextInjected = HonoContext & ContextInject & AppContext

async function injectAppContext(ctx: HonoContext, next: Next) {
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

async function injectResponseHeaders(ctx: HonoContext, next: Next) {
	await next()
	const mctx = ctx as HonoContextInjected
	for (const [k, v] of Object.entries(mctx.cache.cacheHeaders)) {
		ctx.res.headers.set(k, v)
	}
	ctx.res.headers.set('X-Cache-Version', String(Config.CACHE_DATA_VERSION))
	ctx.res.headers.set('X-Server-Version', String(process.env.SERVER_VERSION))
	ctx.res.headers.set('X-Nekocha', process.env.MOTD ?? "is nekocha cute?")
	ctx.res.headers.set('X-Server-Online', String(Config.isServerLogin))
	if (mctx.cache.minExpirationTime < Infinity) {
		ctx.res.headers.set('X-Min-Expiration', String(mctx.cache.minExpirationTime))
	}
}

async function checkRateLimit(ctx: HonoContext, next: Next) {
	const reqUrl = new URL(ctx.req.url)
	const pathname = reqUrl.pathname
	const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
	if (!success) {
		return ctx.text(`429 Too Many Requests`, 429)
	}
	await next()
}

async function responseCtagCache(ctx: HonoContext, next: Next) {
	await next()
	const url = new URL(ctx.req.url)
	const ctagToken = ctx.req.header("X-Frontworker-CTag-Token")
	if (process.env.FRONTWORKER_CTAG_TOKEN && process.env.FRONTWORKER_CTAG_TOKEN !== ctagToken) {
		return
	}
	const ctag = url.searchParams.get("ctag")
	const cacheTime = Config.RESPONSE_CACHE_TIME ?? 0
	if (!ctag || !cacheTime || cacheTime <= 0) {
		return
	}
	if (![200, 302, 304, 307].includes(ctx.res.status)) { return }

	const cache = (ctx as HonoContextInjected).cache
	const minExpirationTime = cache.minExpirationTime
	const nowS = Math.floor(Date.now() / 1000)
	const maxCacheTime = minExpirationTime - nowS
	const maxAge = Math.min(cacheTime, maxCacheTime)
	const staleWhileRevalidate = Math.min(Config.RESPONSE_CACHE_STALE_WHILE_REVALIDATE, maxAge)
	ctx.res.headers.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`)
	ctx.res.headers.set("X-Ctag", ctag)
	ctx.res.headers.set("X-Front-Cache-Enable", "true")
}

const app = new Hono<{ Bindings: Env }>();

app.use(checkRateLimit)
app.use(injectAppContext)
app.use(injectResponseHeaders)
app.use(responseCtagCache)

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