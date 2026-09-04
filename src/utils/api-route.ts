import { OpenAPIRoute } from "chanfana";
import { AppContext, BiliTypes } from "../types";
import { b23Parser } from "./b23-parse";
import z from "zod";
import { Config } from "../config";
import CacheableObject from "./cache";

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time: number,
    data: Data,
}

export default abstract class APIRoute extends OpenAPIRoute {

    public SERVER_VERSION = process.env.SERVER_VERSION
    public CACHE_DATA_VERSION = Config.CACHE_DATA_VERSION
    protected CF_CACHE_BASEURL = "https://bili.internal/cache"
    protected BILI_REFERER = "https://www.bilibili.com"
    protected BILI_VIDEO_PATTERN = new URLPattern("*://*bilibili.com/video/*")
    protected BILI_B23TV_PATTERN = new URLPattern("*://*b23.tv/*")

    protected CDNS: BiliTypes.BiliVideoCDN = {
        ali: 'upos-sz-mirrorali.bilivideo.com',
        aliov: 'upos-sz-mirroraliov.bilivideo.com',
        alib: 'upos-sz-mirroralib.bilivideo.com',
        alio1: 'upos-sz-mirroralio1.bilivideo.com',
        ali02: 'upos-sz-mirrorali02.bilivideo.com',
        cos: 'upos-sz-mirrorcos.bilivideo.com',
        cosb: 'upos-sz-mirrorcosb.bilivideo.com',
        coso1: 'upos-sz-mirrorcoso1.bilivideo.com',
        cosov: 'upos-sz-mirrorcosov.bilivideo.com',
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
    }
    protected readonly BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    protected readonly MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    protected readonly BILI_NAV_IPR = "https://api.bilibili.com/x/web-interface/nav"

    protected readonly DEFAULT_HEADERS: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }

    public ctx?: AppContext
    public abstract invoke(ctx: AppContext, ...args: any[]): Response | Promise<Response>
    public override async handle(ctx: AppContext, ...args: any[]) {
        this.ctx = ctx
        const cache = new CacheableObject(ctx)
        // inject context
        ctx.cache = cache
        ctx.jsonResp = <Data = any>(message: string, code: number, data: Data, schema?: z.ZodType<Data>): Response => {
            if (schema) {
                const parsed = schema.safeParse(data)
                if (!parsed.success) {
                    throw new Error(`response validation failed: ${parsed.error.message}`)
                }
                data = parsed.data as Data
            }
            const response: APIResponse<Data> = {
                code: code,
                message: message ?? "",
                data: data,
                time: Date.now()
            }
            return ctx.json(response, code as any)
        }
        for (const [k, v] of Object.entries(this.DEFAULT_HEADERS)) {
            ctx.header(k, v)
        }
        const response = await this.invoke(ctx, ...args)
        for (const [k, v] of Object.entries(cache.cacheHeaders)) {
            response.headers.set(k, v)
        }
        response.headers.set('X-Cache-Version',String(this.CACHE_DATA_VERSION))
        response.headers.set('X-Server-Version',this.SERVER_VERSION)
        response.headers.set('X-Nekocha',process.env.MOTD ?? "is nekocha cute?")
        response.headers.set('X-Server-Online',String(Config.isServerLogin))
        return response
    }

    get nowS() {
        return Math.floor(Date.now() / 1000)
    }

    protected readonly CacheKey = {
        videoInfo: (bvid: string) => {
            return `${this.CACHE_DATA_VERSION}:videoInfo:${bvid}`
        },
        videoPlayUrl: (cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat, loginKey: string) => {
            return `${this.CACHE_DATA_VERSION}:videoPlayUrl:${loginKey}:${cid}:${qn}:${platform}:${format}`
        },
        videoSubtitles: (cid: number) => {
            return `${this.CACHE_DATA_VERSION}:subtitle:${cid}`
        },
        userArchieves: (mid: number, seasonId: number, page: number, pageSize: number) => {
            return `${this.CACHE_DATA_VERSION}:userArchieves:${mid}:${seasonId}:${page}:${pageSize}`
        },
        bangumiInfo: (seasonId?: number, episodeId?: number) => {
            if (seasonId) {
                return `${this.CACHE_DATA_VERSION}:bangumiInfo:season:${seasonId}`
            }
            return `${this.CACHE_DATA_VERSION}:bangumiInfo:episode:${episodeId}`
        },
        bangumiEpisodes: (seasonId?: number) => {
            return `${this.CACHE_DATA_VERSION}:bangumiEpisodes:season:${seasonId}`
        },
        /**
         * @deprecated
         */
        bangumiPlayUrl: (epid: number, qn: number) => {
            return `${this.CACHE_DATA_VERSION}:bangumiPlayUrl:${epid}:${qn}`
        },
        danmaku: (cid: number) => {
            return `${this.CACHE_DATA_VERSION}:danmaku:${cid}`
        },
        live: (roomId: number) => {
            return `${this.CACHE_DATA_VERSION}:live:${roomId}`
        }
    }

    protected readonly utils = {
        switchCDN: (ctx: AppContext, url: string, cdn?: keyof BiliTypes.BiliVideoCDN) => {
            const cf = ctx.req.raw.cf
            let cdnHostname: string | undefined = undefined
            if (cdn && this.CDNS[cdn]) {
                cdnHostname = this.CDNS[cdn]
            }
            else {
                for (const strategy of Config.VIDEO_CDN_STRATEGE) {
                    const isMatch = (strategy.continent === '*' || cf?.continent === strategy.continent) && (strategy.area === '*' || cf?.country === strategy.area)
                    if (isMatch) {
                        const cdnName = strategy.cdn
                        cdnHostname = this.CDNS[cdnName]
                        ctx.header('X-CDN-Strategy', `${strategy.continent},${strategy.area},${cdnName}`)
                        break
                    }
                }
            }
            if (cdnHostname) {
                const _ = new URL(url)
                _.hostname = cdnHostname
                url = _.toString()
                ctx.header('X-Bili-CDN', cdnHostname)
            }
            return url
        },
        switchDashCDN: (ctx: AppContext, dash: BiliTypes.RES.Video.PlayDash['dash'], cdn?: keyof BiliTypes.BiliVideoCDN) => {
            const replaceHost = <T extends BiliTypes.RES.Video.AudioDashItem | BiliTypes.RES.Video.VideoDashItem>(dashItem: T) => {
                dashItem.baseUrl = this.utils.switchCDN(ctx, dashItem.baseUrl, cdn)
                dashItem.backupUrl = dashItem.backupUrl.map(u => this.utils.switchCDN(ctx, u, cdn))
                return dashItem
            }
            dash.video = dash.video ? dash.video.map(replaceHost) : dash.video
            dash.audio = dash.audio ? dash.audio.map(replaceHost) : dash.audio
            dash.dobly = dash.dobly ? dash.dobly.map(replaceHost) : dash.dobly
            dash.flac = dash.flac ? dash.flac.map(replaceHost) : dash.flac
            return dash
        },
        getUrlBv: async (biliurl: string | URL): Promise<{ bvid: string, p: number } | null> => {
            try {
                let url: URL = new URL(biliurl)
                if (this.BILI_B23TV_PATTERN.test(url)) {
                    const rawURL = await b23Parser(url.toString())
                    url = new URL(rawURL)
                }

                if (this.BILI_VIDEO_PATTERN.test(url)) {
                    const pathname = url.pathname
                    const bvpart = pathname.match(/(BV[a-zA-Z0-9]{10})/)?.[1]
                    const part = url.searchParams.get("p") || undefined
                    const bvid = z.string().trim().nullable().default(null).safeParse(bvpart).data
                    const p = z.coerce.number().default(1).safeParse(part).data
                    if (bvid && p) {
                        return { bvid: bvid, p: p }
                    }
                }
                return null
            } catch (error) {
                return null
            }
        }
    }
}