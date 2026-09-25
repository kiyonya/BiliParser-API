import { Config } from "../config";
import { AppContext } from "../types";
import APIRoute from "../utils/api-route";

export class BiliVideoCDNRoute extends APIRoute {
    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            return ctx.jsonResp( 'Success', 200,{
                cdns: Config.VIDEO_CDN,
                strategy:Config.VIDEO_CDN_STRATEGE
            })
        } catch (error) {
            return ctx.jsonResp( (error as Error)?.message, 500, null)
        }
    }
}