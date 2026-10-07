import { BiliTypes } from "../types"
import Parser from "../utils/parser"
import { proxyFetch } from "../utils/proxy-fetch"
import SharedData from "../shared/data"

export interface GetPlayURLTaskReturns {
    url: string, quality: number, platform: BiliTypes.BVideoPlatform
}


export default class BiliVideoParser extends Parser {

    protected readonly formatFnvalMap: Record<BiliTypes.RES.Video.VideoPlayFormat, number> = {
        mp4: 1,
        dash: 4048
    }

    public async getVideoInfo(videoId: BiliTypes.BVideoId): Promise<BiliTypes.RES.Video.VideoInfo> {
        const cookie = await this.BCrypto.getBiliCookie();
        const videoViewInfoURL = new URL(SharedData.BILI_VIDEO_VIEW_API)

        switch (videoId.type) {
            case "avid":
                videoViewInfoURL.searchParams.append('aid', String(videoId.id))
                break
            case "bvid":
                videoViewInfoURL.searchParams.append('bvid', videoId.id)

        }
        const videoViewReq = await proxyFetch(videoViewInfoURL, {
            headers: {
                'cookie': cookie
            }
        })
        const videoViewData = await videoViewReq.json<BiliTypes.BAPI.BiliVideoViewInfo>()
        if (videoViewData.code === 0) {
            const headData = videoViewData.data
            const duration = headData.duration
            const bvid = videoViewData.data.bvid || null
            const aid = headData.aid > 0 ? headData.aid : null
            const cid = headData.cid
            const cover = headData.pic || ""
            const title = headData.title || ""
            const desc = headData.desc || ""
            const owner = headData.owner || { mid: 0, name: "", face: "" }
            const parts: BiliTypes.RES.Video.VideoPart[] = (headData.pages || []).map(i => ({
                partTitle: i.part,
                page: i.page,
                firstFrame: i.first_frame || cover,
                duration: i.duration,
                cid: i.cid,
                ctime: i.ctime
            }))
            const info: BiliTypes.RES.Video.VideoInfo = {
                bvid: bvid,
                aid: aid,
                cid: cid,
                pic: cover,
                duration: duration,
                title: title,
                desc: desc,
                owner: owner,
                info_source: 'view',
                infoSource: 'view',
                parts: parts,
            }
            return info
        }

        const videoCidURL = new URL(SharedData.BILI_CID_BACKUP_API)
        switch (videoId.type) {
            case "avid":
                videoCidURL.searchParams.append('aid', String(videoId.id))
                break
            case "bvid":
                videoCidURL.searchParams.append('bvid', videoId.id)

        }
        const videoCidReq = await proxyFetch(videoCidURL, {
            headers: new Headers({
                'Referer': SharedData.BILI_REFERER, 'Cookie': cookie
            })
        })
        const videoCidData = await videoCidReq.json<BiliTypes.BAPI.BiliVideoCidInfo>()
        if (videoCidData.code === 0 && videoCidData.data.length && videoCidData.data[0]) {

            const pageData = videoCidData.data[0]
            if (!pageData) {
                throw new Error(`cannot get page data`)
            }
            const cid = pageData.cid as number
            const duration = pageData.duration as number
            const bvid = videoId.type === 'bvid' ? videoId.id : null
            const aid = null
            const cover = pageData.first_frame || ""
            const title = pageData.part || ""
            const desc = ""
            const owner = { mid: 0, name: "", face: "" }
            const parts: BiliTypes.RES.Video.VideoPart[] = (videoCidData.data || []).map(i => ({
                partTitle: i.part,
                page: i.page,
                firstFrame: i.first_frame || cover,
                duration: i.duration,
                cid: i.cid,
                ctime: i.ctime
            }))
            const info: BiliTypes.RES.Video.VideoInfo = {
                bvid: bvid,
                aid: aid,
                cid: cid,
                pic: cover,
                duration: duration,
                title: title,
                desc: desc,
                owner: owner,
                info_source: 'fallback',
                infoSource: 'fallback',
                parts: parts
            }
            return info
        }

        throw new Error("cannot get bili video info")
    }

    private toVideoDashItem(dash: BiliTypes.BAPI.BiliDashItem): BiliTypes.RES.Video.VideoDashItem {
        const isVideoDash = dash.mimeType.indexOf("video") >= 0
        if (!isVideoDash) {
            throw new Error("cannot parse dash to video dash item:dash is not for video")
        }
        const vdash: BiliTypes.RES.Video.VideoDashItem = {
            baseUrl: dash.baseUrl,
            backupUrl: dash.backupUrl || [],
            bandwidth: dash.bandwidth,
            width: dash.width,
            height: dash.height,
            mime: dash.mimeType,
            codecid: dash.codecid,
            codecs: dash.codecs,
            frameRate: (() => {
                try {
                    return parseFloat(dash.frameRate)
                } catch (error) {
                    return 0.0
                }
            })(),
            quality: dash.id
        }
        return vdash
    }

    private toAudioDashItem(dash: BiliTypes.BAPI.BiliDashItem): BiliTypes.RES.Video.AudioDashItem {
        const isAudioDash = dash.mimeType.indexOf("audio") >= 0
        if (!isAudioDash) {
            throw new Error("cannot parse dash to audio dash item:dash is not for audio")
        }
        const adash: BiliTypes.RES.Video.AudioDashItem = {
            baseUrl: dash.baseUrl,
            backupUrl: dash.backupUrl || [],
            bandwidth: dash.bandwidth,
            mime: dash.mimeType,
            codecid: dash.codecid,
            codecs: dash.codecs,
            quality: dash.id
        }
        return adash
    }

    private getUrlExpirationAt(url: URL): number {
        let urlExpirationAt: number
        try {
            if (url.searchParams.has('deadline')) {
                urlExpirationAt = (parseInt(url.searchParams.get('deadline') as string))
            }
            else {
                urlExpirationAt = Math.floor(Date.now() / 1000) + 3600
            }
        } catch (error) {
            urlExpirationAt = Math.floor(Date.now() / 1000) + 3600
        }
        return urlExpirationAt
    }

    private createPlayDash(dashw: BiliTypes.BAPI.BiliPlayDash, cid: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat): BiliTypes.RES.Video.PlayDash {
        const dash = dashw.data.dash
        if (!dash) {
            throw new Error("cannot create dash")
        }
        const baseUrl = dash.video[0]?.baseUrl
        if(!baseUrl){
            throw new Error("source is got,but no video found")
        }
        const vurl = new URL(baseUrl)
        const playDash: BiliTypes.RES.Video.PlayDash = {
            duration: dash.duration,
            isDash: true,
            dash: {
                minBufferTime: dash.minBufferTime,
                video: dash.video ? dash.video.map(this.toVideoDashItem) : null,
                audio: dash.audio ? dash.audio.map(this.toAudioDashItem) : null,
                dobly: dash.dolby?.audio ? dash.dolby.audio.map(this.toAudioDashItem) : null,
                flac: dash.flac?.audio ? [this.toAudioDashItem(dash.flac.audio)] : null
            },
            format: format,
            platform: platform,
            cid: cid,
            urlExpirationAt: this.getUrlExpirationAt(vurl),
            realQuality: Math.max(...dash.video.map(i => i.id))
        }
        return playDash
    }

    private createPlayUrl(playUrl: BiliTypes.BAPI.BiliPlayURL, cid: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat): BiliTypes.RES.Video.PlayURL {
        const durlItem = playUrl.data.durl[0]
        const quality = playUrl.data.quality
        if (!durlItem) {
            throw new Error("cannot create durl")
        }
        const durl = durlItem.url
        if (!durl) {
            throw new Error("source is got,but no video found")
        }
        const url = new URL(durl)
        const duration = Math.floor(durlItem.length / 1000)
        const pUrl: BiliTypes.RES.Video.PlayURL = {
            isDash: false,
            duration: duration,
            cid: cid,
            urlExpirationAt: this.getUrlExpirationAt(url),
            platform: platform,
            format: format,
            url: url.toString(),
            backupUrl: durlItem.backup_url || [],
            quality: quality,
            realQuality: quality
        }
        return pUrl;
    }

    private createReqUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): URL {
        const url = new URL(SharedData.BILI_VIDEO_PLAYURL_API)
        switch (videoId.type) {
            case "avid":
                url.searchParams.append("avid", String(videoId.id))
                break
            case "bvid":
                url.searchParams.append("bvid", String(videoId.id))
                break
        }
        url.searchParams.append('cid', String(cid))
        url.searchParams.append('qn', String(qn))
        url.searchParams.append('otype', 'json')
        url.searchParams.append('platform', String(platform))
        url.searchParams.append('high_quality', '1')
        url.searchParams.append('try_look', '1')
        url.searchParams.append('fnval', String(this.formatFnvalMap[format]))
        url.searchParams.append('fourk', "1")
        url.searchParams.append("fnver", "0")
        return url
    }

    private async createWbiReqUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<URL> {
        const wbiUrl = new URL(SharedData.BILI_VIDEO_WBI_PLAYURL_API)
        const params: Record<string, any> = {
            cid, qn, try_look: 1, platform: platform, high_quality: 1, otype: "json", fnval: this.formatFnvalMap[format], fourk: 1, fnver: 0
        }
        switch (videoId.type) {
            case "avid":
                params["avid"] = String(videoId.id)
                break
            case "bvid":
                params["bvid"] = String(videoId.id)
                break
        }
        const sign = await this.BCrypto.signWbi(params)
        for (const [key, value] of Object.entries(sign)) {
            wbiUrl.searchParams.append(key, value)
        }
        return wbiUrl
    }

    private async createAppReqUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: BiliTypes.PlatformAPPKEY, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<URL> {
        const params: Record<string, any> = {
            cid: String(cid),
            qn: String(qn),
            platform: platform.platform,
            ts: String(Math.floor(Date.now() / 1000)),
            otype: "json",
            fnval: this.formatFnvalMap[format],
            fourk: 1,
            fnver: 0
        };
        switch (videoId.type) {
            case "avid":
                params["avid"] = String(videoId.id)
                break
            case "bvid":
                params["bvid"] = String(videoId.id)
                break
        }
        const sign = await this.BCrypto.signApp(params, platform);
        const url = new URL(SharedData.BILI_VIDEO_PLAYURL_API)
        for (const [key, value] of Object.entries(sign)) {
            url.searchParams.append(key, value)
        }
        return url
    }

    /**
     * @reload
     */
    protected async getStreamWebLike(
        videoId: BiliTypes.BVideoId,
        cid: number,
        cookie: string,
        qn: number,
        platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">,
        format: 'dash'
    ): Promise<BiliTypes.RES.Video.PlayDash>;
    protected async getStreamWebLike(
        videoId: BiliTypes.BVideoId,
        cid: number,
        cookie: string,
        qn: number,
        platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">,
        format: 'mp4'
    ): Promise<BiliTypes.RES.Video.PlayURL>;
    protected async getStreamWebLike(videoId: BiliTypes.BVideoId, cid: number, cookie: string, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash> {
        const requests: (() => Request | Promise<Request>)[] = [
            () => new Request(this.createReqUrl(videoId, cid, qn, platform, format), {
                headers: {
                    ...SharedData.FAKE_BROWSER_HEADERS,
                    'referer': SharedData.BILI_REFERER,
                    'Cookie': cookie
                },
                method: "GET"
            }),
            async () => new Request(await this.createWbiReqUrl(videoId, cid, qn, platform, format), {
                headers: {
                    ...SharedData.FAKE_BROWSER_HEADERS,
                    'Referer': SharedData.BILI_REFERER,
                    'Cookie': cookie
                },
                method: "GET"
            })
        ]
        for (const getRequest of requests) {
            try {
                const request = await getRequest()
                const response = await proxyFetch(request)
                if (response.status !== 200) {
                    throw new Error("invalid response")
                }
                if (format === 'dash') {
                    const dataDash = await response.json<BiliTypes.BAPI.BiliPlayDash>()
                    if (dataDash.code === 0 && dataDash.data.dash) {
                        return this.createPlayDash(dataDash, cid, platform as any, format)
                    }
                    throw new Error("cannot get dash")
                }
                else if (format === 'mp4') {
                    const dataMp4 = await response.json<BiliTypes.BAPI.BiliPlayURL>()
                    if (dataMp4.code === 0 && dataMp4.data.durl[0]) {
                        return this.createPlayUrl(dataMp4, cid, platform as any, format)
                    }
                    throw new Error("cannot get mp4")
                }
            } catch (error) {
                //-
            }
        }
        throw new Error(`cannot get video stream by web with format:${format},platform:${platform};if your platform is html5 and format is dash,it requires the server login,or an error will be throw like this;retry platform:pc with format:dash`)
    }

    protected async getStreamAppLike(
        videoId: BiliTypes.BVideoId,
        cid: number,
        cookie: string,
        qn: number,
        platform: "app",
        format: 'dash'
    ): Promise<BiliTypes.RES.Video.PlayDash>;
    protected async getStreamAppLike(
        videoId: BiliTypes.BVideoId,
        cid: number,
        cookie: string,
        qn: number,
        platform: "app",
        format: 'mp4'
    ): Promise<BiliTypes.RES.Video.PlayURL>;
    protected async getStreamAppLike(videoId: BiliTypes.BVideoId, cid: number, cookie: string, qn: number, platform: "app", format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.PlayDash | BiliTypes.RES.Video.PlayURL> {

        const requests: (() => Promise<Request>)[] = [
            async () => new Request(await this.createAppReqUrl(videoId, cid, qn, SharedData.PLATFORM_KEY.ios, format), {
                headers: {
                    "User-Agent": SharedData.PLATFORM_KEY.ios.ua
                },
                method: "GET"
            }),
            async () => new Request(await this.createAppReqUrl(videoId, cid, qn, SharedData.PLATFORM_KEY.tv, format), {
                headers: {
                    "User-Agent": SharedData.PLATFORM_KEY.tv.ua
                },
                method: "GET"
            }),
        ]

        for (const getRequest of requests) {
            try {
                const request = await getRequest()
                const response = await proxyFetch(request)
                if (response.status !== 200) {
                    throw new Error("invalid response")
                }
                if (format === 'dash') {
                    const dataDash = await response.json<BiliTypes.BAPI.BiliPlayDash>()
                    if (dataDash.code === 0 && dataDash.data.dash) {
                        return this.createPlayDash(dataDash, cid, platform as any, format)
                    }
                    throw new Error("cannot get dash")
                }
                else if (format === 'mp4') {
                    const dataMp4 = await response.json<BiliTypes.BAPI.BiliPlayURL>()
                    if (dataMp4.code === 0 && dataMp4.data.durl[0]) {
                        return this.createPlayUrl(dataMp4, cid, platform as any, format)
                    }
                    throw new Error("cannot get mp4")
                }
            } catch (error) {
                //-
            }
        }
        throw new Error("cannot get video stream by app")
    }

    /**
     * @reload
     */
    public async getVideoPlayUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: "mp4"): Promise<BiliTypes.RES.Video.PlayURL>
    public async getVideoPlayUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: "dash"): Promise<BiliTypes.RES.Video.PlayDash>
    public async getVideoPlayUrl(videoId: BiliTypes.BVideoId, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform = 'html5', format: BiliTypes.RES.Video.VideoPlayFormat = 'mp4'): Promise<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash> {
        const cookie = await this.BCrypto.getBiliCookie();
        switch (platform) {
            case "html5":
            case "pc":
            default:
                // 针对此实现的调用已成功，但重载的实现签名在外部不可见
                return this.getStreamWebLike(videoId, cid, cookie, qn, platform, format as any)
            case "app":
                return this.getStreamAppLike(videoId, cid, cookie, qn, platform, format as any)
        }
    }


    public async getVideoContentLength(videoUrl: string | URL): Promise<number | null> {
        try {
            const headReq = await fetch(videoUrl, {
                method: "HEAD",
                headers: {
                    "User-Agent": SharedData.BROWSER_UA,
                    "Referer": SharedData.BILI_REFERER
                }
            })
            const headers = headReq.headers
            const length = headers.get('Content-Length')
            if (length) {
                return parseInt(length)
            }
            return null
        } catch (error) {
            return null
        }
    }

    public async getVideoDanmakuXML(cid: number): Promise<string | null> {
        const cookie = await this.BCrypto.getBiliCookie();
        const url = new URL(SharedData.BILI_DANMAKU_API)
        url.pathname = `${cid}.xml`
        const req = await proxyFetch(url, {
            headers: { ...SharedData.FAKE_BROWSER_HEADERS, 'Referer': SharedData.BILI_REFERER, 'Cookie': cookie }
        })
        const isXML = req.headers.get('content-type') === 'text/xml' || req.headers.get('content-type') === 'application/xml'
        if (isXML) {
            const xmlText = await req.text()
            return xmlText
        }
        return null
    }

    public async getVideoSubtitles(videoId: BiliTypes.BVideoId, cid: number): Promise<BiliTypes.RES.Subtitle.SubtitleItem[]> {
        const cookie = await this.BCrypto.getBiliCookie()
        const url = new URL(SharedData.BILI_PLAYERV2_API)
        const params: Record<string, string> = {
            cid: String(cid)
        }
        switch (videoId.type) {
            case "avid":
                params["avid"] = String(videoId.id)
                break
            case "bvid":
                params["bvid"] = String(videoId.id)
                break
        }
        const sign = await this.BCrypto.signWbi(params)
        for (const [key, value] of Object.entries(sign)) {
            url.searchParams.append(key, value)
        }
        const req = await proxyFetch(url, {
            headers: { ...SharedData.FAKE_BROWSER_HEADERS, 'Referer': SharedData.BILI_REFERER, 'Cookie': cookie }
        });
        const data = await req.json() as BiliTypes.BAPI.BiliPlayerV2
        if (data.code === 0) {
            const s: BiliTypes.RES.Subtitle.SubtitleItem[] = []
            const subtitles = data.data.subtitle.subtitles || []
            const urlProtocol = "https:"
            for (const subtitle of subtitles) {
                const item: BiliTypes.RES.Subtitle.SubtitleItem = {
                    originalJsonUrl: subtitle.subtitle_url ? `${urlProtocol}${subtitle.subtitle_url}` : "",
                    originalJsonUrlV2: subtitle.subtitle_url_v2 ? `${urlProtocol}${subtitle.subtitle_url_v2}` : "",
                    lang: subtitle.lan,
                    langName: subtitle.lan_doc,
                    id: subtitle.id_str
                }
                s.push(item)
            }
            return s
        }
        throw new Error("cannot get subtitles")
    }
}