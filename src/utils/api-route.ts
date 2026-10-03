import { OpenAPIRoute } from "chanfana";
import { AppContext, BiliTypes, CDNStrategy } from "../types";
import z from "zod";
import { Geolib } from "./geolib";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export interface APIResponse<Data = any> {
    code: number,
    message: string,
    time?: number,
    data: Data,
}

export namespace ResolveBiliURL {

    export interface Video {
        type: "video",
        bvid: string,
        p: number
    }

    export interface Live {
        type: "live",
        roomId: number
    }

    export type Resolved = Video | Live
}

export default abstract class Route extends OpenAPIRoute {

    public static readonly utils = {
        matchStrategy: (strategies: CDNStrategy[], cf?: CfProperties): CDNStrategy | undefined => {
            return strategies.find(strategy =>
                (strategy.continent === '*' || cf?.continent === strategy.continent) &&
                (strategy.area === '*' || cf?.country === strategy.area)
            )
        },
        isCNArea: (cf?: CfProperties) => {
            if (!cf) { return false }
            return cf.continent === 'AS' && cf.country === 'CN'
        },
        switchVideoCDN: (ctx: AppContext, url: string, cdn?: string) => {
            let cdnHostname: string | undefined = undefined
            if (cdn && Config.VIDEO_CDN[cdn]) {
                cdnHostname = Config.VIDEO_CDN[cdn]
            }
            else {
                const geo = Geolib.geo(ctx.req.raw.cf)
                const match = Geolib.matchStrategy(Config.VIDEO_CDN_STRATEGE, geo)
                if (match) {
                    const cdnName = match.cdn as string
                    cdnHostname = Config.VIDEO_CDN[cdnName]
                    ctx.header('X-CDN-Strategy', `${match.continent},${match.area},${cdnName}`)
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
        switchDashCDN: (ctx: AppContext, dash: BiliTypes.RES.Video.PlayDash['dash'], cdn?: string) => {
            const replaceHost = <T extends BiliTypes.RES.Video.AudioDashItem | BiliTypes.RES.Video.VideoDashItem>(dashItem: T) => {
                dashItem.baseUrl = Route.utils.switchVideoCDN(ctx, dashItem.baseUrl, cdn)
                dashItem.backupUrl = dashItem.backupUrl.map(u => Route.utils.switchVideoCDN(ctx, u, cdn))
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
                const geo = Geolib.geo(ctx.req.raw.cf)
                isUseOvStream = !Geolib.isCN(geo)
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
        resolveBiliUrl: async (biliurl: string | URL): Promise<ResolveBiliURL.Resolved | null> => {
            try {
                let url: URL = new URL(biliurl)
                if (SharedData.URLPatterns.B23_TV.test(url)) {
                    const targetUrl = await Route.utils.getShortLinkRedirectUrl(url)
                    if (targetUrl) { url = targetUrl }
                }

                if (SharedData.URLPatterns.BILI_VIDEO.test(url)) {
                    const pathname = url.pathname
                    const bvpart = pathname.match(/(BV[a-zA-Z0-9]{10})/)?.[1]
                    const part = url.searchParams.get("p") || undefined
                    const bvid = z.string().trim().nullable().default(null).safeParse(bvpart).data
                    const p = z.coerce.number().int().nonnegative().default(1).transform(p => p === 0 ? 1 : p).safeParse(part).data
                    if (bvid && p) {
                        const result: ResolveBiliURL.Video = {
                            type: "video",
                            bvid: bvid,
                            p: p
                        }
                        return result
                    }
                }
                else if (SharedData.URLPatterns.BILI_LIVE.test(url)) {
                    const pathname = url.pathname
                    const roomId = z.coerce.number().int().positive().safeParse(pathname.substring(1).split("/").shift()).data
                    if (roomId) {
                        const result: ResolveBiliURL.Live = {
                            type: "live",
                            roomId: roomId
                        }
                        return result
                    }
                }
                return null
            } catch (error) {
                return null
            }
        }
    }
    protected readonly utils = Route.utils
    get nowS() {
        return Math.floor(Date.now() / 1000)
    }

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