import { OpenAPIRoute } from "chanfana";
import { AppContext, AppLocation, CDNAllocation } from "../types/app";
import { parseCDNAllocation } from "../utils/cdn";
import { BiliTypes } from "../types/bili";
import SharedData from "../shared/data";
import z from "zod";

export class BadRequestError extends Error {
    constructor(message?: string) {
        super(message ?? "bad request")
        this.name = "BadRequestError"
    }
}

export abstract class API extends OpenAPIRoute {
    protected static isOriginCDNHeaderSet:boolean = false
    public static readonly utils = {
        matchCDNAllocation: (allocations: CDNAllocation[], appLocation?: AppLocation): CDNAllocation | undefined => {
            return allocations.find(allocation =>
                (allocation.continent === '*' || appLocation?.continent === allocation.continent) &&
                (allocation.area === '*' || appLocation?.country === allocation.area)
            )
        },
        isCNArea: (appLocation?: AppLocation) => {
            if (!appLocation) { return false }
            return appLocation.continent === 'AS' && appLocation.country === 'CN'
        },
        switchVideoCDN: (ctx: AppContext, url: string, cdn?: string, customAllocation?: string) => {
            let cdnHostname: string | undefined = undefined
            if (cdn && ctx.config.VIDEO_CDN[cdn]) {
                cdnHostname = ctx.config.VIDEO_CDN[cdn]
            }
            else {
                let allocation = ctx.config.VIDEO_CDN_ALLOCATION
                if (customAllocation) {
                    try {
                        allocation = parseCDNAllocation(customAllocation)
                    } catch (error) { }
                }
                const match = this.utils.matchCDNAllocation(allocation, ctx.appLocation)
                if (match) {
                    const cdnName = match.cdn as string
                    cdnHostname = ctx.config.VIDEO_CDN[cdnName]
                    ctx.header('X-CDN-Allocation', `${match.continent},${match.area},${cdnName}`.toLowerCase())
                }
            }
            if (cdnHostname) {
                const replaceUrl = new URL(url)
                const originHostname = replaceUrl.hostname
                replaceUrl.hostname = cdnHostname
                url = replaceUrl.toString()
                ctx.header('X-Bili-CDN', cdnHostname)
                if(!this.isOriginCDNHeaderSet){
                    ctx.header('X-Bili-Origin-CDN', originHostname)
                    this.isOriginCDNHeaderSet = true
                }
            }
            return url
        },
        switchDashCDN: (ctx: AppContext, dash: BiliTypes.RES.Video.PlayDash['dash'], cdn?: string, customAllocation?: string) => {
            const replaceHost = <T extends BiliTypes.RES.Video.AudioDashItem | BiliTypes.RES.Video.VideoDashItem>(dashItem: T) => {
                dashItem.baseUrl = API.utils.switchVideoCDN(ctx, dashItem.baseUrl, cdn, customAllocation)
                dashItem.backupUrl = dashItem.backupUrl.map(u => API.utils.switchVideoCDN(ctx, u, cdn, customAllocation))
                return dashItem
            }
            dash.video = dash.video ? dash.video.map(replaceHost) : dash.video
            dash.audio = dash.audio ? dash.audio.map(replaceHost) : dash.audio
            dash.dobly = dash.dobly ? dash.dobly.map(replaceHost) : dash.dobly
            dash.flac = dash.flac ? dash.flac.map(replaceHost) : dash.flac
            return dash
        },
        switchStreamCDN: (ctx: AppContext, stream: { urls: { url: string }[] }, ov?: boolean) => {
            let isUseOvStream: boolean
            if (ov !== undefined) {
                isUseOvStream = ov
            }
            else {
                isUseOvStream = !this.utils.isCNArea(ctx.appLocation)
            }
            if (isUseOvStream) {
                stream.urls.forEach(ug => {
                    ug.url = ug.url.replace('--cn', '--ov')
                })
            }
            else {
                stream.urls.forEach(ug => {
                    ug.url = ug.url.replace('--ov', '--cn')
                })
            }
            return { stream: stream, server: isUseOvStream ? 'ov' : 'cn' }
        },
        getShortLinkRedirectUrl: async (b23Url: string | URL): Promise<URL | null> => {
            const url = b23Url instanceof URL ? b23Url : new URL(b23Url)
            try {
                if (SharedData.URLPatterns.B23_TV.test(url)) {
                    const req = await fetch(url, {
                        method: "HEAD",
                        redirect: 'manual'
                    })
                    const location = req.headers.get("location")
                    if (!location) {
                        return null
                    }
                    const targetUrl = new URL(location)
                    if (SharedData.URLPatterns.BILI_HOST.test(targetUrl)) {
                        return targetUrl
                    }
                    return null
                }
            } catch (error) { }
            return null
        },
        resolveBvid: (i: string): string | null => {
            i = i.trim()
            const bvLike = i.match(SharedData.BVID_REG)?.[1]?.trim()
            if (bvLike && bvLike.startsWith("BV")) { return bvLike }
            return null
        },
        resolveAvid: (i: string): number | null => {
            i = i.trim();
            const avid = i.match(SharedData.AVID_REG)?.[1]?.trim();
            if (avid) {
                const avNumber = parseInt(avid, 10);
                return Number.isNaN(avNumber) ? null : avNumber;
            }
            return null;
        },
        resolveVideoEntryFromUrl: async (iurl: URL | string): Promise<{ videoId: BiliTypes.BVideoId, p: number } | null> => {
            let url: URL = iurl instanceof URL ? iurl : new URL(iurl)
            if (SharedData.URLPatterns.B23_TV.test(url)) {
                const targetUrl = await API.utils.getShortLinkRedirectUrl(url)
                if (targetUrl) { url = targetUrl }
            }
            if (SharedData.URLPatterns.BILI_VIDEO.test(url)) {
                const pathname = url.pathname
                const p = Math.max(url.searchParams.has("p") ? parseInt(url.searchParams.get("p")!) : 1, 1)
                const bv = this.utils.resolveBvid(pathname)
                if (bv) {
                    return { videoId: { type: "bvid", id: bv }, p: p }
                }
                const av = this.utils.resolveAvid(pathname)
                if (av) {
                    return { videoId: { type: "avid", id: av }, p: p }
                }
            }
            return null
        },
        resolveLiveRoomIdFromUrl: async (iurl: URL | string): Promise<number | null> => {
            let url: URL = iurl instanceof URL ? iurl : new URL(iurl)
            if (SharedData.URLPatterns.B23_TV.test(url)) {
                const targetUrl = await API.utils.getShortLinkRedirectUrl(url)
                if (targetUrl) { url = targetUrl }
            }
            if (SharedData.URLPatterns.BILI_LIVE.test(url)) {
                const roomIdLike = url.pathname.split('/').filter(i => i.length)[0]
                if (roomIdLike) {
                    const roomId = parseInt(roomIdLike, 10)
                    if (!Number.isNaN(roomId) && roomId > 0) {
                        return roomId
                    }
                }
            }
            return null
        },
        zodBiliUrl: (patterns: URLPattern[], message?: string) => {
            return z.url().refine(
                (u) => patterns.some(p => p.test(u)),
                message ?? "url is not a supported bilibili url"
            )
        },
        zodBiliVideoIdTransformer: async <T>(args: T) => {
            //@ts-ignore
            const { id, url, p } = args
            if (url) {
                const resolved = await this.utils.resolveVideoEntryFromUrl(url)
                if (resolved) {
                    return { ...args, videoId: resolved.videoId, p: resolved.p ?? p }
                }
            }
            else if (id) {
                const bvid = this.utils.resolveBvid(id)
                if (bvid) { return { ...args, videoId: { type: "bvid", id: bvid } as BiliTypes.BVideoId } }
                const avid = this.utils.resolveAvid(id)
                if (avid) { return { ...args, videoId: { type: "avid", id: avid } as BiliTypes.BVideoId } }
            }
            return { ...args, videoId: null }
        },
        // zodAlignVideoQualityTransformer: <T>(args: T) => {
        //     //@ts-ignore
        //     let { qn } = args
        //     if (!ctx.config.IS_SERVER_LOGIN) {
        //         qn = Math.min(qn, 80)
        //     }
        //     return { ...args, qn }
        // }
    }
    protected readonly utils = API.utils
    get nowS() {
        return Math.floor(Date.now() / 1000)
    }

    public override async handle(ctx: AppContext): Promise<Response> {
        try {
            return await this.handler(ctx)
        } catch (error) {
            if (error instanceof BadRequestError) {
                return ctx.jsonResp(error.message, 400, null)
            }
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }

    protected abstract handler(ctx: AppContext): Promise<Response> | Response;

    protected async getSchemaValidData<Data>(
        data: Data,
        schema: z.ZodType<Data> | undefined,
        throwIfNotValid: true
    ): Promise<Data>;
    protected async getSchemaValidData<Data>(
        data: Data,
        schema?: z.ZodType<Data>,
        throwIfNotValid?: false
    ): Promise<Data | null>;
    protected async getSchemaValidData<Data>(
        data: Data,
        schema?: z.ZodType<Data>,
        throwIfNotValid: boolean = false
    ): Promise<Data | null> {
        if (!schema) { return data }
        const parsed = await schema.safeParseAsync(data)
        if (parsed.success) {
            return parsed.data
        }
        else {
            if (throwIfNotValid) {
                throw parsed.error || new Error("data schema validation failed")
            }
            else {
                return null
            }
        }
    }
}