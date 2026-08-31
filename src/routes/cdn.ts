import { AppContext } from "../types";
import APIRoute from "../utils/api-route";
import { Validation } from "../validation";

export class BiliVideoCDNRoute extends APIRoute {
    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }
            return this.jsonResponse(ctx, 'Success', 200, this.CDNS, Validation.videoCDNSchema)
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}