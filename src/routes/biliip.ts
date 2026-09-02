import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";
import { proxyFetch } from "../utils/proxy-fetch";

export class BiliIpRegionRoute extends APIRoute {

    public override async Ihandle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
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
            }, Validation.ipRegionSchema)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}