/**
 * bili-parser api general
 * @author nekocha(kiyuu)
 * @copyright nekocha 2026
 * @license MIT
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import { md5String } from '../general/utils/hashlib';
import { createServer } from "../general";
import { API } from "../general/apis/api";
import { AppConfig } from "../general/utils/app-config";
import { createAppLocationFromCf, createCfServer } from "./cf";

export class BiliAPIEntryPoint extends WorkerEntrypoint {
	protected cacheEnable = true
	async fetch(request: Request): Promise<Response> {
		const app = createServer(createCfServer())
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

		const config = new AppConfig(this.env as Record<any,any>)
		//@ts-ignore
		this.ctx.config = config

		const cacheVersion = config.CACHE_DATA_VERSION
		const serverVersion = config.SERVER_VERSION
		const isServerLogin = config.IS_SERVER_LOGIN
		const serverLoginHashkey = config.SERVER_LOGIN_HASHKEY
		const location = createAppLocationFromCf(request.cf)

		const ctagParams = {
			cdnAllocation: API.utils.matchCDNAllocation(config.VIDEO_CDN_ALLOCATION, location),
			isCN: API.utils.isCNArea(location),
			isServerLogin: isServerLogin,
			loginHash: serverLoginHashkey,
			cacheVersion: cacheVersion,
			serverVersion: serverVersion
		}

		const ctag = md5String(JSON.stringify(ctagParams))
		url.searchParams.set('__ctag', ctag)
		const modifiedRequest = new Request(url, request)
		modifiedRequest.headers.set('Ctag', ctag)

		const requestStart = Date.now()
		const response: Response = await this.ctx.exports.BiliAPIEntryPoint.fetch(modifiedRequest, {
			cf: request.cf
		})
		const requestEnd = Date.now()
		const requestDuration = Math.max(0, requestEnd - requestStart)

		const mutableResponse = new Response(response.body, response)
		const cfCacheStatus = mutableResponse.headers.get("cf-cache-status")
		if (cfCacheStatus === 'HIT') {
			//改写header
			mutableResponse.headers.delete('X-Bcrypto-Cookies-Cache')
			mutableResponse.headers.delete('X-Bcrypto-Sign-Time')
			if (mutableResponse.headers.has('X-Server-Cache-Web')) {
				mutableResponse.headers.set("X-Server-Cache-Web", 'PASS')
			}
			if (mutableResponse.headers.has('X-Server-Cache-Kv')) {
				mutableResponse.headers.set("X-Server-Cache-Kv", 'PASS')
			}
		}
		mutableResponse.headers.set('X-Cache-Version', String(cacheVersion))
		mutableResponse.headers.set('X-Server-Version', String(serverVersion))
		mutableResponse.headers.set('X-Server-Online', String(isServerLogin))
		mutableResponse.headers.set("X-Request-Duration", String(requestDuration))
		return mutableResponse
	}
}