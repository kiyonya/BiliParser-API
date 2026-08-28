import { AppContext } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";

export class BiliVideoCDNRoute extends APIRoute {
    public override async handle(context: AppContext): Promise<Response> {
        return this.jsonResponse(context, 'Success', 200, this.CDNS, Validation.videoCDNSchema)
    }
}