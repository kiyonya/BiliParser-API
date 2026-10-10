import { AppContext } from "../types/app";
import { API } from "./api";

export class VideoCDNAPI extends API {
    public override async handler(ctx: AppContext): Promise<Response> {
        return ctx.jsonResp( 'Success', 200,{
            cdns: ctx.config.VIDEO_CDN,
            strategy:ctx.config.VIDEO_CDN_ALLOCATION
        })
    }
}