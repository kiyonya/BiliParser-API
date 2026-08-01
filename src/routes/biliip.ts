import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import { proxyFetch } from "../utils/proxy-fetch";

export class BiliIpRegionRoute extends APIRoute {

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            const headers = new Headers()
            headers.append('User-Agent', this.BROWSER_UA)
            const req = await proxyFetch(this.BILI_NAV_IPR, {
                method: "GET",
                headers: headers
            })
            const res = await req.json<BiliTypes.BAPI.BiliNav>()
            const ipRegion = res.data.ip_region
            return this.jsonResponse(ctx, 'Success', 200, {
                ipRegion: ipRegion
            })
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}