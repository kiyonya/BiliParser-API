import { AppContext } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";

export class BiliVideoCDNRoute extends APIRoute {
    public override async invoke(ctx: AppContext): Promise<Response> {
        try {
            return ctx.jsonResp( 'Success', 200, this.CDNS, Validation.videoCDNSchema)
        } catch (error) {
            return ctx.jsonResp( (error as Error)?.message, 500, null)
        }
    }
}