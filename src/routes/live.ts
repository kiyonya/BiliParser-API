import { AppContext, BiliTypes } from "../types";
import z from "zod";
import BiliLiveParser from "../services/live-parser";
import APIRoute from "../utils/api-route";

export class BiliLiveRoute extends APIRoute {

    private readonly PARAMS = z.object({
        type: z.enum(['json', 'stream']).default('stream'),
        platform: z.enum(['xlive', 'h5']).default('xlive'),
        codec: z.enum(['avc', 'hevc']).default('avc'),
        format: z.enum(['fmp4', 'flv', 'ts']).default('fmp4'),
        protocol: z.enum(['hls', 'stream']).default('hls'),
        ov: z.coerce.boolean().optional(),
        roomId: z.coerce.number().optional(),
        url: z.url("*://live.bilibili.com/*").optional()
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

    private getRoomIdFromURL(url: string): number | undefined {
        try {
            const u = new URL(url)
            const BILI_LIVE_PATTERN = new URLPattern('*://live.bilibili.com/*')
            if (BILI_LIVE_PATTERN.test(u)) {
                const pathname = u.pathname
                const roomId = pathname.substring(1).split("/").shift() as string
                return parseInt(roomId)
            }
            return undefined
        } catch (error) {
            return undefined
        }
    }

    private switchStreamCdn(ctx: AppContext, stream: BiliTypes.RES.Live.LiveStream, ov?: boolean) {
        let isUseOvStream: boolean = false
        if (ov !== undefined) {
            isUseOvStream = ov
        }
        else {
            const cf = ctx.req.raw.cf
            const isChinaRegion = cf?.continent === 'AS' && cf.country === "CN"
            if (isChinaRegion) {
                isUseOvStream = false
            }
            else {
                isUseOvStream = true
            }
        }

        if (isUseOvStream) {
            stream.urls.forEach(ug => {
                ug.url = ug.url.replace('--cn', '--ov')
            })
            this.resHeaders.set('X-Stream-Server', 'ov')
        }
        else {
            stream.urls.forEach(ug => {
                ug.url = ug.url.replace('--ov', '--cn')
            })
            this.resHeaders.set('X-Stream-Server', 'cn')
        }
    }

    private createLiveCacheKey(roomId: number) {
        return `live_${roomId}`
    }

    public override async handle(ctx: AppContext) {
        try {
            await this.checkRateLimit(ctx)

            const url = new URL(ctx.req.url)
            const params = this.PARAMS.safeParse({
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
                return
            }
            let { roomId, type, codec, format, protocol, ov, url: urlProvided, platform } = params.data
            if (!roomId && urlProvided) {
                roomId = this.getRoomIdFromURL(urlProvided)
            }
            if (!roomId) {
                return
            }
            const cacheKey = this.createLiveCacheKey(roomId)
            //edgeonly
            let cached = await this.EdgeCache.getEdgeCache<BiliTypes.RES.Live.Live>(ctx, cacheKey)
            let result = cached?.data
            if (!result) {
                const parser = new BiliLiveParser()
                const info = await parser.getLiveInfo(roomId)
                result = {
                    ...info,
                    stream: null
                }
                if (info.isLiving) {
                    const realRoomId = info.roomId
                    const formatNumber = this.formatNumberMap[format]
                    const codecNumber = this.codecNumberMap[codec]
                    const protocolNumber = this.protocolNumberMap[protocol]
                    const playStream = await parser.getLivePlayStream(realRoomId, platform, formatNumber, codecNumber, protocolNumber)
                    result.stream = playStream
                }
                //edgeonly
                await this.EdgeCache.setEdgeCache(ctx, cacheKey, result, this.nowS + this.BILI_LIVE_CACHE_TIME)
            }
            else {
                this.cacheHits.edge.add(cacheKey)
            }

            if (result.stream) {
                this.resHeaders.set('X-Stream-Parse-Platform', result.stream.platform)
                if (result.stream.platform === 'xlive') {
                    this.resHeaders.set('X-Stream-Format', format)
                    this.resHeaders.set('X-Stream-Codec', codec)
                    this.resHeaders.set('X-Stream-Protocol', protocol)
                }
                this.switchStreamCdn(ctx, result.stream, ov)
            }

            switch (type) {
                case "json":
                    return this.jsonResponse(ctx, 'Success', 200, result)
                case "stream":
                default:
                    //选取流
                    if (!result.stream) {
                        return ctx.text('', 404)
                    }
                    const streamURL = result.stream.urls[0]?.url
                    if (!streamURL) {
                        return ctx.text('', 404)
                    }
                    return ctx.redirect(streamURL, 302)
            }
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}