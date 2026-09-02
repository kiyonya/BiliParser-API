import { AppContext } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";

export class BiliVideoCDNRoute extends APIRoute {
    public override async Ihandle(ctx: AppContext): Promise<Response> {
        try {
            return this.jsonResponse(ctx, 'Success', 200, this.CDNS, Validation.videoCDNSchema)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}