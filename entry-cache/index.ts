import z from "zod"
import crypto from 'crypto'

export function md5String(i: string) {
    return crypto.createHash("md5").update(i).digest("hex")
}

export default {
    async fetch(req: Request, env: Env, _c: ExecutionContext) {
        const cf = req.cf
        const url = new URL(req.url)

        const cacheVersion:number = z.coerce.number().default(5).safeParse(process.env.CACHE_DATA_VERSION).data ?? 5
        const serverVersion = process.env.SERVER_VERSION
        const strategy = process.env.CDN_STRATEGY
        const token = process.env.FRONTWORKER_CTAG_TOKEN

        const params: Record<string, string | undefined> = {
            continent: cf?.continent as string | undefined,
            country: cf?.country as string | undefined,
            cacheVersion:String(cacheVersion),
            serverVersion:String(serverVersion),
            strategy:String(strategy)
        }

        const ctag: string = md5String(JSON.stringify(params))
        url.searchParams.set("ctag", ctag)
        const passReq = new Request(url, req)
        passReq.headers.set("X-Frontworker-CTag-Token",token)
        return await env.BILI_API.fetch(passReq, {
            cf: cf
        })
    }
}
