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
	async fetch(request: Request): Promise<Response> {
		const response = await app.fetch(request, this.env, this.ctx)
		if (!response.headers.has('Cache-Control')) {
			response.headers.set('Cache-Control', "no-store")
		}
		response.headers.set('X-Cache-Version', String(Config.CACHE_DATA_VERSION))
		response.headers.set('X-Server-Version', String(process.env.SERVER_VERSION))
		response.headers.set('X-Server-Online', String(Config.IS_SERVER_LOGIN))
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
		const ctagParams = {
			cdnStrategy: Geolib.matchStrategy(Config.VIDEO_CDN_STRATEGE, geo),
			isCN: Geolib.isCN(geo),
			loginHash: Config.SERVER_LOGIN_HASHKEY,
			cacheVersion: Config.CACHE_DATA_VERSION,
			serverVersion: this.env.SERVER_VERSION ?? "N/A"
		}
		const ctag = md5String(JSON.stringify(ctagParams))
		url.searchParams.set('__ctag', ctag)
		const modifiedRequest = new Request(url, request)
		modifiedRequest.headers.set('Ctag', ctag)
		return this.ctx.exports.BiliAPIEntryPoint.fetch(modifiedRequest, {
			cf: request.cf
		})
	}
}