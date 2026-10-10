import SharedData from "../shared/data";
import { Schema } from "../shared/schema";
import { AppContext } from "../types/app";
import { BiliTypes } from "../types/bili";
import { API } from "./api";

export class IpRegionAPI extends API {

    public override async handler(ctx: AppContext) {
        const req = await ctx.appFetch(SharedData.BILI_WEB_NAV, {
            method: "GET",
            headers: {
                'Referer': SharedData.BILI_REFERER,
                ...SharedData.FAKE_BROWSER_HEADERS
            }
        })
        const res = await req.json() as BiliTypes.BAPI.BiliNav
        const ipRegion = res.data.ip_region
        return ctx.jsonResp('Success', 200, {
            ipRegion: ipRegion
        }, Schema.ipRegionSchema)
    }
}