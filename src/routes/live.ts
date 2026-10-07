import { AppContext, BiliTypes } from "../types";
import z from "zod";
import BiliLiveParser from "../services/live-parser";
import Route from "../utils/api-route";
import { Schema } from "../shared/schema";
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliLiveRoute extends Route {

    private readonly paramSchema = z.object({
        type: z.enum(['json', 'stream']).default('stream'),
        platform: z.enum(['xlive', 'h5']).default('xlive'),
        codec: z.enum(['avc', 'hevc']).default('avc'),
        format: z.enum(['fmp4', 'flv', 'ts']).default('fmp4'),
        protocol: z.enum(['hls', 'stream']).default('hls'),
        ov: z.string().optional().transform(ov => {
            if (!ov || !["true", "false"].includes(ov)) { return undefined }
            return ov === "true"
        }),
        roomId: z.coerce.number().optional(),
        url: this.utils.zodBiliUrl([SharedData.URLPatterns.BILI_LIVE, SharedData.URLPatterns.B23_TV], "url must be a live.bilibili.com room or b23.tv short link").optional()
    })
        .transform(async (args) => {
            const { url } = args
            if (url) {
                const resolvedRoomId = await this.utils.resolveLiveRoomIdFromUrl(url)
                if (resolvedRoomId) {
                    return { ...args, roomId: resolvedRoomId }
                }
            }
            return args
        }).superRefine((args, ctx) => {
            if (!args.roomId) {
                ctx.addIssue("roomId or url needed to parse")
            }
        })

    private readonly formatNumberMap: Record<'fmp4' | 'flv' | 'ts', number> = {
        flv: 0,
        ts: 1,
        fmp4: 2
    }
    private readonly codecNumberMap: Record<'avc' | 'hevc', number> = {
        avc: 0,
        hevc: 1
    }
    private readonly protocolNumberMap: Record<'stream' | 'hls', number> = {
        stream: 0,
        hls: 1
    }

    private async parseLive(ctx: AppContext, roomId: number, platform: "xlive" | "h5", codec: "avc" | "hevc", format: "fmp4" | "flv" | "ts", protocol: "stream" | "hls"): Promise<BiliTypes.RES.Live.Live> {
        const liveCacheKey = SharedData.cacheKey.live(roomId, platform, codec, format, protocol)
        let live = await this.getSchemaValidData(await ctx.cache.getCache<BiliTypes.RES.Live.Live>(liveCacheKey, undefined, 'edge', true), Schema.liveSchema)
        if (!live) {
            const parser = new BiliLiveParser(ctx)
            const liveInfo: BiliTypes.RES.Live.LiveInfo = await parser.getLiveInfo(roomId)
            const livef: BiliTypes.RES.Live.Live = {
                ...liveInfo,
                stream: null,
                streamExpirationAt: null
            }
            const isLiving = liveInfo.isLiving
            let streamMinExpirationAt: number | null = null
            if (isLiving) {
                const realRoomId = liveInfo.roomId
                const formatNumber = this.formatNumberMap[format]
                const codecNumber = this.codecNumberMap[codec]
                const protocolNumber = this.protocolNumberMap[protocol]
                const liveStream: BiliTypes.RES.Live.LiveStream = await parser.getLivePlayStream(realRoomId, platform, formatNumber, codecNumber, protocolNumber)
                livef.stream = liveStream

                const streamExpirations = liveStream.urls.map(surl => {
                    try {
                        const url = new URL(surl.url)
                        const expires = url.searchParams.get("expires")
                        if (expires) {
                            return Math.max(parseInt(expires), 0)
                        }
                    } catch (error) { }
                    return undefined
                }).filter(e => e !== undefined)

                streamMinExpirationAt = Math.min(...streamExpirations)
                livef.streamExpirationAt = streamMinExpirationAt
                ctx.header('X-Live-Room', String(realRoomId))
            }
            live = await this.getSchemaValidData(livef, Schema.liveSchema, true)
            let cacheTtl = streamMinExpirationAt ? Math.min(streamMinExpirationAt, this.nowS + Config.BILI_LIVE_CACHE_TIME) : this.nowS + Config.BILI_LIVE_CACHE_TIME
            await ctx.cache.setCache(liveCacheKey, live, cacheTtl, undefined, 'edge')
        }
        return live
    }

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const params = await this.paramSchema.safeParseAsync({
                roomId: ctx.req.param('roomId') || url.searchParams.get('roomId') || undefined,
                type: url.searchParams.get('type') || undefined,
                codec: url.searchParams.get('codec') || undefined,
                format: url.searchParams.get('format') || undefined,
                protocol: url.searchParams.get('protocol') || undefined,
                ov: url.searchParams.get('ov') || undefined,
                url: url.searchParams.get('url') || undefined,
                platform: url.searchParams.get('platform') || undefined
            })

            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            let { roomId, type, codec, format, protocol, ov, platform } = params.data
            if (!roomId) {
                return ctx.jsonResp("cannot found roomId to parse", 400, null)
            }

            const live = await this.parseLive(ctx, roomId, platform, codec, format, protocol)
            if (live.stream && live.isLiving) {
                ctx.header('X-Stream-Parse-Platform', live.stream.platform)
                if (live.stream.platform === 'xlive') {
                    ctx.header('X-Stream-Format', format)
                    ctx.header('X-Stream-Codec', codec)
                    ctx.header('X-Stream-Protocol', protocol)
                }
                const { server } = this.utils.switchStreamCDN(ctx, live.stream, ov)
                ctx.header('X-Stream-Server', server)
            }

            switch (type) {
                case "json":
                    return ctx.jsonResp('Success', 200, live)
                case "stream":
                default:
                    if (!live.stream) {
                        return ctx.text('', 404)
                    }
                    const streamURL = live.stream.urls[0]?.url
                    if (!streamURL) {
                        return ctx.text('', 404)
                    }
                    return ctx.redirect(streamURL, 302)
            }
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}