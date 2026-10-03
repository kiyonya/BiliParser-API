
import { Config } from "../shared/config";
import { AppContext } from "../types";
import Route from "../utils/api-route";

export class BiliVideoCDNRoute extends Route {
    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            return ctx.jsonResp( 'Success', 200,{
                cdns: Config.VIDEO_CDN,
                strategy:Config.VIDEO_CDN_ALLOCATION
            })
        } catch (error) {
            return ctx.jsonResp( (error as Error)?.message, 500, null)
        }
    }
}