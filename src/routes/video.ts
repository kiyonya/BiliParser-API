import { OpenAPIRoute } from "chanfana";
import { APITypes, BiliTypes, type AppContext } from "../types";
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
    akam: "upos-hz-mirrorakam.akamaized.net"
} as const;

export class BiliVideoRoute extends OpenAPIRoute {

    private readonly BILI_VIDEO_URLPATTERN = new URLPattern({ hostname: "*.bilibili.com", pathname: "/video/*" })
    private readonly BILI_BTV_URLPATTERN = new URLPattern({ hostname: "b23.tv" })
    private readonly BV_PATTERN = new RegExp(/(BV[a-zA-Z0-9]{10})/)

    private readonly BILI_URL_CACHE_TIME = process.env.X_PLAYURL_CACHE_TIME ? parseInt(process.env.X_PLAYURL_CACHE_TIME) : 5400
    private readonly BILI_VIDEOINFO_CACHE_TIME = process.env.X_VIDEOINFO_CACHE_TIME ? parseInt(process.env.X_VIDEOINFO_CACHE_TIME) : 60 * 60 * 24

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
            "X-Nekocha": "is nekocha silly?",
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

    private isCacheAvailable(cache: APITypes.APICacheWarp<any>): boolean {
        const expirationS = cache.expiration
        const nowS = Math.floor(Date.now() / 1000)
        if (nowS < expirationS) {
            return true
        }
        return false
    }

    private createBiliInfoCacheKey(bvid: string) {
        return `info_${bvid}`
    }

    private createPlayURLCacheKey(bvid: string, qn: number, platform: BiliTypes.GetURLPlatform) {
        return `playurl_${bvid}_${platform}_${qn}`
    }

    private async getBiliVideoInfoCache(ctx: AppContext, bvid: string): Promise<BiliTypes.BiliVideoInfo | null> {
        const key = this.createBiliInfoCacheKey(bvid)
        const cache = await ctx.env.BILI_VIDEOINFO_CACHE.get<APITypes.APICacheWarp<BiliTypes.BiliVideoInfo>>(key, 'json')
        if (cache) {
            const available = this.isCacheAvailable(cache)
            if (available) {
                return cache.data
            }
            else {
                await ctx.env.BILI_VIDEOINFO_CACHE.delete(key)
            }
        }
        return null
    }

    private async setBiliVideoInfoCache(ctx: AppContext, bvid: string, info: BiliTypes.BiliVideoInfo) {
        const key = this.createBiliInfoCacheKey(bvid)
        const expiration = Math.floor(Date.now() / 1000) + this.BILI_VIDEOINFO_CACHE_TIME
        const warp: APITypes.APICacheWarp<BiliTypes.BiliVideoInfo> = {
            data: info,
            expiration: expiration
        }
        await ctx.env.BILI_VIDEOINFO_CACHE.put(key, JSON.stringify(warp), {
            expiration: expiration
        })
    }

    private async getBiliPlayUrlCache(ctx: AppContext, bvid: string, qn: number, platform: BiliTypes.GetURLPlatform): Promise<BiliTypes.BiliPlayURL | null> {
        const key = this.createPlayURLCacheKey(bvid, qn, platform)
        const cache = await ctx.env.BILI_PLAYURL_CACHE.get<APITypes.APICacheWarp<BiliTypes.BiliPlayURL>>(key, 'json')
        if (cache) {
            const available = this.isCacheAvailable(cache)
            if (available) {
                return cache.data
            }
            else {
                await ctx.env.BILI_PLAYURL_CACHE.delete(key)
            }
        }
        return null
    }

    /**
     * 需要根据视频时长计算安全过期时间 所以额外需要videoDuration 解耦后data里并不包含
     */
    private async setBiliPlayUrlCache(ctx: AppContext, bvid: string, qn: number, platform: BiliTypes.GetURLPlatform, videoDuration: number, data: BiliTypes.BiliPlayURL) {
        const key = this.createPlayURLCacheKey(bvid, qn, platform)
        let videoBufferTimeS: number
        if (videoDuration < 60 * 10) {
            videoBufferTimeS = 60
        }
        else if (videoDuration < 3600) {
            videoBufferTimeS = Math.min(videoDuration * 0.1, 10 * 60)
        }
        else {
            videoBufferTimeS = Math.min(videoDuration * 0.05, 20 * 60)
        }

        const videoExpirationS = data.urlExpirationAt - videoBufferTimeS
        const userExpirationS = Math.floor(Date.now() / 1000) + this.BILI_URL_CACHE_TIME
        const expiration: number = Math.min(videoExpirationS, userExpirationS)
        const warp: APITypes.APICacheWarp<BiliTypes.BiliPlayURL> = {
            data: data,
            expiration: expiration
        }

        await ctx.env.BILI_PLAYURL_CACHE.put(key, JSON.stringify(warp), {
            expiration: expiration
        })
    }

    private async parseBiliVideo(ctx: AppContext, bvid: string, qn: number, platform: BiliTypes.GetURLPlatform): Promise<{ result: BiliTypes.BiliParseResult, infoCacheHit: boolean, urlCacheHit: boolean }> {

        const parser = new BiliVideoParser()

        let videoInfoCacheHit: boolean = false
        let videoPlayURLCacheHit: boolean = false

        let videoInfo = await this.getBiliVideoInfoCache(ctx, bvid)
        if (!videoInfo) {
            videoInfo = await parser.getBiliVideoInfo(bvid)
            await this.setBiliVideoInfoCache(ctx, bvid, videoInfo)
        }
        else {
            videoInfoCacheHit = true
        }

        let playUrl = await this.getBiliPlayUrlCache(ctx, bvid, qn, platform)
        if (!playUrl) {
            const cid = videoInfo.cid
            const duration = videoInfo.duration
            playUrl = await parser.getBiliPlayURL(bvid, cid, qn, platform)
            await this.setBiliPlayUrlCache(ctx, bvid, qn, platform, duration, playUrl)
        }
        else {
            videoPlayURLCacheHit = true
        }

        const result: BiliTypes.BiliParseResult = {
            ...videoInfo,
            ...playUrl
        }

        return {
            result: result,
            infoCacheHit: videoInfoCacheHit,
            urlCacheHit: videoPlayURLCacheHit
        }
    }

    public override async handle(context: AppContext): Promise<Response> {
        try {
            const cf = context.req.raw.cf
            const url = new URL(context.req.url)
            const pathname = url.pathname
            const { success } = await context.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return context.text(`429 Too Many Requests`, 429)
            }

            const parmas = url.searchParams

            let type = this.R_AVAILABLE_TYPE.safeParse(parmas.get('type')).data || 'video'
            let platform = this.R_AVAILABLE_PLATFORM.safeParse(parmas.get('method')).data || 'web'
            let cdn = this.R_AVAILABLE_CDN.safeParse(parmas.get('cdn')).data
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

            if (!bvid) {
                return this.createJsonResponse(context, "cannot get bvid to parse", 400, null)
            }

            const { result, infoCacheHit, urlCacheHit } = await this.parseBiliVideo(context, bvid, qn, platform)


            const cacheHitHeader: Record<string, string> = {
                "X-Info-Cache-Hit": infoCacheHit ? 'true' : 'false',
                "X-URL-Cache-Hit": urlCacheHit ? 'true' : 'false'
            }
            const biliServerHeaders: Record<string, string> = {}


            let cdnHostname: string
            if (cdn && CDNS[cdn]) {
                cdnHostname = CDNS[cdn]
            }
            else {
                //国内用户默认分配ali
                //海外默认分配aliov
                const isCN = cf?.continent === 'AS' && cf.country === "CN"
                if (isCN) {
                    cdnHostname = CDNS['ali'] as string
                }
                else {
                    cdnHostname = CDNS['aliov'] as string
                }
            }

            if (cdnHostname) {
                biliServerHeaders['X-bili-video-cdn'] = cdnHostname
                const mirrorURL = new URL(result.url)
                mirrorURL.hostname = cdnHostname
                result.url = mirrorURL.toString()
            }

            switch (type) {
                case "json":
                    return this.createJsonResponse<BiliTypes.BiliParseResult>(context, "Success", 200, result, {
                        ...cacheHitHeader,
                        ...biliServerHeaders
                    })
                case "url":
                    return context.text(result.url, 200, {
                        ...cacheHitHeader,
                        ...biliServerHeaders
                    })
                case "video":
                default:
                    return context.redirect(result.url, 307)
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