import z from "zod";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import { avToBv, bvToAv } from "../services/b2a";

// !?blue archieve?!
export class BARoute extends APIRoute {

    private readonly PARAMS = z.object({
        bvid: z.string().optional(),
        avid: z.coerce.number().optional()
    })

    private readonly BV_PATTERN = new RegExp(/(BV[a-zA-Z0-9]{10})/)

    public override async handle(ctx: AppContext) {
        try {
            await this.checkRateLimit(ctx)
            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
                bvid: url.searchParams.get('bvid') || undefined,
                avid: url.searchParams.get('avid')?.replaceAll('av', '') || undefined
            })
            if (!params.success) {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
            const { bvid, avid } = params.data

            if (bvid) {
                if (!this.BV_PATTERN.test(bvid)) {
                    return this.jsonResponse(ctx, 'invalid params', 400, null)
                }
                const avid = bvToAv(bvid)
                return this.jsonResponse<BiliTypes.RES.BAvid>(ctx, 'Success', 200, {
                    avid: avid,
                    bvid: bvid
                })
            }
            else if (avid) {
                const bvid = avToBv(avid)
                return this.jsonResponse<BiliTypes.RES.BAvid>(ctx, 'Success', 200, {
                    avid: avid,
                    bvid: bvid
                })
            }
            else {
                return this.jsonResponse(ctx, 'invalid params', 400, null)
            }
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}
