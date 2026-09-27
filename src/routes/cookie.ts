
import { AppContext } from "../types";
import APIRoute from "../utils/api-route";
import BiliCrypto from "../utils/bili-crypto";

export class BiliCookieRoute extends APIRoute {
    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            const bCrypto = new BiliCrypto(ctx)
            const cookie = await bCrypto.createAnonymousCookie()
            let parts: string[] = []
            for (const [k, v] of Object.entries(cookie)) {
                parts.push(`${k}=${v}`)
            }
            return ctx.text(parts.join("; "))
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}