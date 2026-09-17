/**
 * bili-parser api
 * @author nekocha(kiyuu)
 * @copyright nekocha 2026
 * @license MIT
 */

import app from './app'
import { WorkerEntrypoint } from "cloudflare:workers";
import { Geolib } from './utils/geolib';
import { Config } from './config';
import { md5String } from './utils/hashlib';

export class BiliAPIEntryPoint extends WorkerEntrypoint {
	// if cache,this method not invoke
	async fetch(request: Request): Promise<Response> {
		const response = await app.fetch(request, this.env, this.ctx)
		if (!response.headers.has('Cache-Control')) {
			response.headers.set('Cache-Control', "no-store")
		}
		return response
	}
}

export default class DefaultEntryPoint extends WorkerEntrypoint {
	async fetch(request: Request): Promise<Response> {

		const url = new URL(request.url)
		const pathname = url.pathname
		const { success } = await this.env.RATE_LIMITER.limit({ key: pathname })
		if (!success) {
			return new Response("rate limited", { status: 429 })
		}

		const geo = Geolib.geo(request.cf)

		const cacheVersion = Config.CACHE_DATA_VERSION
		const serverVersion = this.env.SERVER_VERSION ?? 'N/A'
		const isServerLogin = Config.IS_SERVER_LOGIN
		const serverLoginHashkey = Config.SERVER_LOGIN_HASHKEY

		const ctagParams = {
			cdnStrategy: Geolib.matchStrategy(Config.VIDEO_CDN_STRATEGE, geo),
			isCN: Geolib.isCN(geo),
			isServerLogin: isServerLogin,
			loginHash:serverLoginHashkey,
			cacheVersion: cacheVersion,
			serverVersion: serverVersion
		}
		const ctag = md5String(JSON.stringify(ctagParams))
		url.searchParams.set('__ctag', ctag)
		const modifiedRequest = new Request(url, request)
		modifiedRequest.headers.set('Ctag', ctag)
		const response: Response = await this.ctx.exports.BiliAPIEntryPoint.fetch(modifiedRequest, {
			cf: request.cf
		})

		const mutableResponse = new Response(response.body, response)
		const cfCacheStatus = mutableResponse.headers.get("cf-cache-status")
		if (cfCacheStatus === 'HIT') {
			//改写header
			mutableResponse.headers.delete('X-Bcrypto-Cookies-Cache')
			mutableResponse.headers.delete('X-Bcrypto-Sign-Time')
			mutableResponse.headers.set('X-Server-Cache-Status',`edge;hit="UNUSED",kv;hit="UNUSED"`)
		}
		mutableResponse.headers.set('X-Cache-Version', String(cacheVersion))
		mutableResponse.headers.set('X-Server-Version', String(serverVersion))
		mutableResponse.headers.set('X-Server-Online', String(isServerLogin))

		return mutableResponse
	}
}