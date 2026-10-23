import { AppContext } from "../types/app";
import { RouteHandler } from "./api";

export class VideoCDNAPI extends RouteHandler {
    public override async doHandle(ctx: AppContext): Promise<Response> {
        return ctx.jsonResp( 'Success', 200,{
            cdns: ctx.config.VIDEO_CDN,
            strategy:ctx.config.VIDEO_CDN_ALLOCATION
        })
    }
}