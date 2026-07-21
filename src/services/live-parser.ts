import { BiliTypes } from "../types"
import Parser from "../utils/parser"
import { proxyFetch } from "../utils/proxy-fetch"

export default class BiliLiveParser extends Parser {

    public async getLiveInfo(roomId: number): Promise<BiliTypes.RES.Live.LiveInfo> {
        const cookie = await this.BCrypto.getBiliAntiCookie()
        const liveInfoUrl = new URL(this.BILI_LIVE_INFO_API)
        liveInfoUrl.searchParams.append('room_id', String(roomId))
        const liveInfoReq = await proxyFetch(liveInfoUrl, {
            headers: { 'User-Agent': this.MOBILE_UA, 'Referer': this.BILI_LIVE_REFERER, 'Cookie': cookie }
        })
        const liveInfoData = await liveInfoReq.json<BiliTypes.BAPI.BiliLiveInfo>()
        // 拿到真实的id 因为有些主播的房间号有别名(short_id)
        if (liveInfoData.code !== 0) {
            throw new Error(`cannot get live room info with code ${liveInfoData.code}`)
        }
        const data = liveInfoData.data
        const { title, uid, room_id, short_id, attention, online, description, area_id, area_name, background, user_cover, keyframe, live_time, live_status } = data
        const result: BiliTypes.RES.Live.LiveInfo = {
            title, uid, roomId: room_id, shortId: short_id, attention, online, description, areaId: area_id, areaName: area_name, background, cover: user_cover, keyframe, liveTime: live_time, isLiving: live_status === 1
        }
        return result
    }

    public async getLivePlayStream(roomId: number, platform: BiliTypes.BLivePlatform = 'h5', format: number, codec: number, protocol: number): Promise<BiliTypes.RES.Live.LiveStream> {
        const cookie = await this.BCrypto.getBiliAntiCookie()
        const tasks: (() => Promise<BiliTypes.RES.Live.LiveStream>)[] = []

        switch (platform) {
            case "h5":
            default:
                tasks.push(async () => this.getLiveByH5(roomId, cookie))
                break
            case "xlive":
                tasks.push(async () => this.getLiveByXlive(roomId, cookie, format, codec, protocol))
                break
        }

        for (const task of tasks) {
            try {
                const stream = await task()
                return stream
            } catch (error) {

            }
        }
        throw new Error('cannot get live play url')
    }

    public async getLiveByH5(roomId: number, cookie: string): Promise<BiliTypes.RES.Live.LiveStream> {

        const url = new URL(this.BILI_LIVE_PLAYURL_API)
        url.searchParams.append('cid', String(roomId))
        url.searchParams.append('platform', 'h5')
        url.searchParams.append('quality', '4')
        const req = await proxyFetch(url, {
            method: 'GET',
            headers: { 'User-Agent': this.MOBILE_UA, 'Referer': this.BILI_LIVE_REFERER, 'Cookie': cookie }
        })
        const data = await req.json<BiliTypes.BAPI.BiliLivePlayURL>()
        if (data.code !== 0 || !data.data.durl.length || !data.data.durl.every(i => Boolean(i.url))) {
            throw new Error('cannot get live play stream')
        }
        const body = data.data
        const durl = body.durl
        const urls = durl.map(i => ({
            url: i.url,
            qn: body.current_qn
        }))

        const stream: BiliTypes.RES.Live.LiveStream = {
            urls: urls,
            platform: 'h5'
        }
        return stream
    }

    public async getLiveByXlive(roomId: number, cookie: string, format: number, codec: number, protocol: number): Promise<BiliTypes.RES.Live.LiveStream> {
        const url = new URL(this.BILI_LIVE_XLIVE_API)

        url.searchParams.append('room_id', String(roomId))
        url.searchParams.append('platform', 'h5')
        url.searchParams.append('qn', '250')
        url.searchParams.append('codec', String(codec))
        url.searchParams.append('format', String(format))
        url.searchParams.append('protocol', String(protocol))

        const req = await proxyFetch(url, {
            method: 'GET',
            headers: { 'User-Agent': this.MOBILE_UA, 'Referer': this.BILI_LIVE_REFERER, 'Cookie': cookie }
        })

        const data = await req.json<BiliTypes.BAPI.BiliXLivePlayInfo>()
        if (data.code !== 0 || !data.data?.playurl_info?.playurl?.stream?.length) {
            throw new Error('cannot get live play stream')
        }

        const streams = data.data?.playurl_info?.playurl?.stream
        const streamURLs: BiliTypes.RES.Live.LiveStreamURL[] = []

        for (const stream of streams) {
            for (const format of stream.format) {
                const formatName = format.format_name
                for (const codec of format.codec) {
                    const codecName = codec.codec_name
                    const baseURL = codec.base_url
                    const qn = codec.current_qn
                    for (const urlPart of codec.url_info) {
                        const host = urlPart.host
                        const extra = urlPart.extra
                        const url = host + baseURL + extra
                        streamURLs.push({
                            url: url,
                            qn: qn,
                            format: formatName,
                            codec: codecName
                        })
                    }
                }
            }
        }

        const stream: BiliTypes.RES.Live.LiveStream = {
            urls: streamURLs,
            platform: 'xlive'
        }

        return stream
    }
}