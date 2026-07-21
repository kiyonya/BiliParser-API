import z from "zod";
import { AppContext } from "../types";
import APIRoute from "../utils/api-route";

export class BiliProxyPlay extends APIRoute {

    private readonly BILI_REFERER = "https://www.bilibili.com"
    private readonly ALLOWED_REQUEST_HEADERS = ['Cookie', 'Origin', 'Range']
    private readonly R_ALLOWED_BILIURLS = [new URLPattern({ hostname: "*.bilivideo.com" })]

    private PARAMS = z.object({
        proxy_ua: z.enum(['web', 'mobile']).default('web'),
        url: z.url("*.bilivideo.com/*"),
        referer: z.string().optional().default(this.BILI_REFERER)
    })

    public override async handle(ctx: AppContext) {
        try {
            if (ctx.req.method === 'OPTIONS') {
                return new Response(null, {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                        'Access-Control-Allow-Headers': 'Range, Origin, Cookie',
                        'Access-Control-Max-Age': '86400'
                    },
                    status: 204
                })
            }

            const url = new URL(ctx.req.url)

            const params = this.PARAMS.safeParse({
                url: url.searchParams.get('url'),
                proxy_ua: url.searchParams.get('proxy_ua') || undefined,
                referer: url.searchParams.get('referer') || undefined
            })
            if (!params.success) {
                return ctx.text('url not provided', 400)
            }

            const { url: targetUrlString, proxy_ua: proxyType, referer } = params.data

            const targetURL = new URL(targetUrlString)
            const isURLAllowed = this.R_ALLOWED_BILIURLS.some(o => o.test(targetURL))
            if (!isURLAllowed) {
                return ctx.text('url not allowed', 403)
            }

            const ua = proxyType === 'web' ? this.BROWSER_UA : this.MOBILE_UA

            const reqHeaders = new Headers()
            for (const key of this.ALLOWED_REQUEST_HEADERS) {
                if (ctx.req.raw.headers.has(key)) {
                    const value = ctx.req.raw.headers.get(key) as string
                    reqHeaders.append(key, value)
                }
            }
            reqHeaders.append('User-Agent', ua)
            reqHeaders.append('Referer', referer)

            const req = await fetch(targetURL, {
                headers: reqHeaders
            })

            if (req.status === 403 || req.status === 401) {
                return ctx.text('this resource was denied,login or vip maybe required by bilibili,sorry :(', 403)
            }
            const responseHeaders = new Headers(req.headers)
            responseHeaders.set('Access-Control-Allow-Origin', '*')
            responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            responseHeaders.set('Access-Control-Allow-Headers', this.ALLOWED_REQUEST_HEADERS.join(','))

            if (req.status === 206) {
                responseHeaders.set('Accept-Ranges', 'bytes')
            }

            return new Response(req.body, {
                headers: responseHeaders,
                status: 206
            })

        } catch (error) {
            return ctx.text((error as Error)?.message || '', 500)
        }
    }
}