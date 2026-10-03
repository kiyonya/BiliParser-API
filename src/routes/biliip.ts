import { AppContext, BiliTypes } from "../types";
import Route from "../utils/api-route";
import { Schema } from "../shared/schema";
import { proxyFetch } from "../utils/proxy-fetch";
import SharedData from "../shared/data";

export class BiliIpRegionRoute extends Route {

    public override async handle(ctx: AppContext) {
        try {
            const req = await proxyFetch(SharedData.BILI_WEB_NAV, {
                method: "GET",
                headers: {
                    'Referer': SharedData.BILI_REFERER,
                    ...SharedData.FAKE_BROWSER_HEADERS
                }
            })
            const res = await req.json<BiliTypes.BAPI.BiliNav>()
            const ipRegion = res.data.ip_region
            return ctx.jsonResp('Success', 200, {
                ipRegion: ipRegion
            }, Schema.ipRegionSchema)
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}