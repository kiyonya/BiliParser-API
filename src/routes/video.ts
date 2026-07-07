import { OpenAPIRoute } from "chanfana";
import { BiliTypes, type AppContext } from "../types";
import BiliVideoParser from "../services/video-parse";
import { b23Parser } from "../utils/b23-parse";
import z from "zod";

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time: number,
    data: Data,
}

const CDNS: Record<string, string> = {
    ali: 'upos-sz-mirrorali.bilivideo.com',
    aliov: 'upos-sz-mirroraliov.bilivideo.com',
    alib: 'upos-sz-mirroralib.bilivideo.com',
    alio1: 'upos-sz-mirroralio1.bilivideo.com',
    ali02: 'upos-sz-mirrorali02.bilivideo.com',
    cos: 'upos-sz-mirrorcos.bilivideo.com',
    cosb: 'upos-sz-mirrorcosb.bilivideo.com',
    coso1: 'upos-sz-mirrorcoso1.bilivideo.com',
    cosdisp: 'upos-sz-mirrorcosdisp.bilivideo.com',
    hw: 'upos-sz-mirrorhw.bilivideo.com',
    hwb: 'upos-sz-mirrorhwb.bilivideo.com',
    hwo1: 'upos-sz-mirrorhwo1.bilivideo.com',
    hwdisp: 'upos-sz-mirrorhwdisp.bilivideo.com',
    bd: 'upos-sz-mirrorbd.bilivideo.com',
    m08c: 'upos-sz-mirror08c.bilivideo.com',
    m08h: 'upos-sz-mirror08h.bilivideo.com',
    m08ct: 'upos-sz-mirror08ct.bilivideo.com',
    estgcos: 'upos-sz-estgcos.bilivideo.com',
    estgoss: 'upos-sz-estgoss.bilivideo.com',
    estghw: 'upos-sz-estghw.bilivideo.com',
    upcdnbda2: 'upos-sz-upcdnbda2.bilivideo.com',
    rali: 'upos-sz-mirrorrali.bilivideo.com',
};

export interface BiliResultWarp {
    data: BiliTypes.BiliPlayResult
    expirationS: number
}

export class BiliVideoRoute extends OpenAPIRoute {

    private readonly BILI_VIDEO_URLPATTERN = new URLPattern({ hostname: "*.bilibili.com", pathname: "/video/*" })
    private readonly BILI_BTV_URLPATTERN = new URLPattern({ hostname: "b23.tv" })
    private readonly BV_PATTERN = new RegExp(/(BV[a-zA-Z0-9]{10})/)
    private readonly BV_CACHE_TIME = process.env.X_KVTTL ? parseInt(process.env.X_KVTTL) : 5400
    private readonly BILI_AVAILABLE_QN = [16, 32, 64, 80, 116, 120]

    private readonly R_AVAILABLE_TYPE = z.enum(["video", "json", "url"]).default("video")
    private readonly R_AVAILABLE_PLATFORM = z.enum(["web", "app"]).optional()
    private readonly R_AVAILABLE_CDN = z.enum(Object.keys(CDNS)).default('ali')
    private readonly R_AVAILABLE_QN = z.enum(["64"]).default("64")

    private async getBvidFromURL(biliurl: string | URL): Promise<string> {
        let url: URL = new URL(biliurl)
        if (this.BILI_BTV_URLPATTERN.test(url)) {
            const rawURL = await b23Parser(url.toString())
            url = new URL(rawURL)
        }
        if (this.BILI_VIDEO_URLPATTERN.test(url)) {
            const pathname = url.pathname
            const bvid = pathname.match(this.BV_PATTERN)?.[1]
            if (bvid) {
                return bvid
            }
        }
        throw new Error("Invalid Bilibili video URL or BV ID")
    }

    private createJsonResponse<Data = any>(ctx: AppContext, message: string, code: number, data: Data, headers?: Record<string, string>): Response {
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "X-Server": "cloudflare",
            "X-NEKOCHA": "is nekocha silly?",
            ...headers
        }
        const response: APIResponse<Data> = {
            code: code,
            message: message ?? "",
            data: data,
            time: Date.now()
        }
        return ctx.json(response, code as any, headers)
    }

    private createCacheKey(bvid: string, qn: number, platform: BiliTypes.GetURLPlatform) {
        return `${bvid}_${platform}_${qn}`
    }

    private async getBiliCache(ctx: AppContext, bvid: string, qn: number, platform: BiliTypes.GetURLPlatform = 'web'): Promise<BiliTypes.BiliPlayResult | null> {
        try {
            const key = this.createCacheKey(bvid, qn, platform)
            const cached = await ctx.env.BILI_CACHE.get<BiliResultWarp>(key, 'json');
            if (cached) {
                const expirationS = cached.expirationS
                const nowS = Math.floor(Date.now() / 1000)
                if (nowS < expirationS) {
                    return cached.data
                }
                else {
                    ctx.env.BILI_CACHE.delete(key).catch(() => { })
                }
            }
            return null
        } catch (error) {
            return null
        }
    }

    private async setBiliCache(ctx: AppContext, bvid: string, qn: number, data: BiliTypes.BiliPlayResult) {
        try {
            const platform = data.platform;
            const key = this.createCacheKey(bvid, qn, platform);

            let videoBufferTimeS: number
            const videoDuration = data.duration
            //动态计算缓冲冗余长度
            if (videoDuration < 60 * 10) {
                videoBufferTimeS = 60
            }
            else if (videoDuration < 3600) {
                videoBufferTimeS = Math.min(videoDuration * 0.1, 10 * 60)
            }
            else {
                videoBufferTimeS = Math.min(videoDuration * 0.05, 20 * 60)
            }

            const videoExpirationS = data.urlExpirationS - videoBufferTimeS
            const userExpirationS = Math.floor(Date.now() / 1000) + this.BV_CACHE_TIME
            const expirationS = Math.min(videoExpirationS, userExpirationS)

            if (expirationS > Math.floor(Date.now() / 1000)) {
                const warp: BiliResultWarp = {
                    expirationS: expirationS,
                    data: data
                };

                await ctx.env.BILI_CACHE.put(key, JSON.stringify(warp), {
                    expiration: expirationS
                });
            } else {
            }
        } catch (error) {

        }
    }

    public override async handle(context: AppContext): Promise<Response> {
        try {
            const url = new URL(context.req.url)
            const parmas = url.searchParams

            let type = this.R_AVAILABLE_TYPE.safeParse(parmas.get('type')).data || 'video'
            let platform = this.R_AVAILABLE_PLATFORM.safeParse(parmas.get('method')).data || 'web'
            let cdn = this.R_AVAILABLE_CDN.safeParse(parmas.get('cdn')).data || 'ali'
            let qn = parseInt(this.R_AVAILABLE_QN.safeParse(parmas.get('qn')).data || "64")

            let bvid: string | null = null
            if (context.req.param('bvid')) {
                const routeBvid = context.req.param('bvid') as string
                if (this.BV_PATTERN.test(routeBvid)) {
                    bvid = routeBvid
                }
            }
            else if (parmas.has('url')) {
                const queryURL = decodeURIComponent(parmas.get('url') as string)
                try {
                    bvid = await this.getBvidFromURL(queryURL)
                } catch (error) {
                    console.log(error)
                }
            }

            if (!bvid || !this.BV_PATTERN.test(bvid) || !this.BILI_AVAILABLE_QN.includes(qn)) {
                return this.createJsonResponse(context, "Invalid parameters", 400, null)
            }

            //await this.getBiliCache(context, bvid, qn)
            let result: BiliTypes.BiliPlayResult | null = await this.getBiliCache(context, bvid, qn) || null
            let isCacheHit: boolean = Boolean(result)
            if (!result) {
                const parser = new BiliVideoParser()
                result = await parser.parseBiliVideo(bvid, qn, platform)
                const parsedVideoQuality = result.quality
                await this.setBiliCache(context, bvid, parsedVideoQuality, result)
            }

            if (cdn && CDNS[cdn]) {
                const url = new URL(result.url)
                url.hostname = CDNS[cdn]
                result.url = url.toString()
            }

            switch (type) {
                case "json":
                    return this.createJsonResponse<BiliTypes.BiliPlayResult>(context, "Success", 200, result, {
                        "X-Cache-Hit": isCacheHit ? "true" : "false"
                    })
                case "url":
                    return context.text(result.url, 200, {
                        "X-Cache-Hit": isCacheHit ? "true" : "false"
                    })
                case "video":
                default:
                    return context.redirect(result.url, 302)
            }

        } catch (error) {
            return this.createJsonResponse(context, (error as Error)?.message, 500, null)
        }
    }
}

export class BiliVideoCDNRoute extends OpenAPIRoute {
    public override async handle(context: AppContext): Promise<Response> {
        context.env
        return context.json({
            code: 200,
            message: "Success",
            data: CDNS,
            time: Date.now()
        })
    }
}