import { AppContext } from "../types/app";
import {BiliCrypto} from "../utils/bili-crypto";
import { RouteHandler } from "./api";

export class CookieAPI extends RouteHandler {
    public override async doHandle(ctx: AppContext): Promise<Response> {
        const bCrypto = new BiliCrypto(ctx)
        const cookie = await bCrypto.createAnonymousCookie()
        let parts: string[] = []
        for (const [k, v] of Object.entries(cookie)) {
            parts.push(`${k}=${v}`)
        }
        return ctx.text(parts.join("; "))
    }
}