import { BiliTypes } from "../types"
import BiliCrypto from "../utils/bili-crypto"
import Parser from "../utils/parser"
import { proxyFetch } from "../utils/proxy-fetch"

export interface GetPlayURLTaskReturns {
    url: string, quality: number, platform: BiliTypes.BVideoPlatform
}


export default class BiliVideoParser extends Parser {

    protected readonly formatFnvalMap: Record<BiliTypes.RES.Video.VideoPlayFormat, number> = {
        mp4: 1,
        dash: 4048
    }

    public async getVideoInfo(bvid: string): Promise<BiliTypes.RES.Video.VideoInfo> {
        const cookie = await this.BCrypto.getBiliAntiCookie();
        const videoViewInfoURL = new URL(this.BILI_VIDEO_VIEW_API)
        videoViewInfoURL.searchParams.append('bvid', bvid)
        const videoViewReq = await proxyFetch(videoViewInfoURL, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const videoViewData = await videoViewReq.json<BiliTypes.BAPI.BiliVideoViewInfo>()
        if (videoViewData.code === 0) {
            const headData = videoViewData.data
            const duration = headData.duration
            const aid = headData.aid
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
                parts: parts
            }
            return info
        }

        const videoCidURL = new URL(this.BILI_CID_BACKUP_API)
        videoCidURL.searchParams.append('bvid', bvid)
        const videoCidReq = await proxyFetch(videoCidURL, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const videoCidData = await videoCidReq.json<BiliTypes.BAPI.BiliVideoCidInfo>()
        if (videoCidData.code === 0 && videoCidData.data.length && videoCidData.data[0]) {

            const pageData = videoCidData.data[0]
            if (!pageData) {
                throw new Error(`cannot get page data`)
            }
            const cid = pageData.cid as number
            const duration = pageData.duration as number
            const aid = -1
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

    private getUrlExpirationAt(url: string): number {
        let urlExpirationAt: number
        try {
            const playURL = new URL(url)
            if (playURL.searchParams.has('deadline')) {
                urlExpirationAt = (parseInt(playURL.searchParams.get('deadline') as string))
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
        const vurl = dash.video[0]?.baseUrl
        if (!vurl) {
            throw new Error("source is got,but no video found")
        }
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
            urlExpirationAt: this.getUrlExpirationAt(vurl)
        }
        return playDash
    }

    private createPlayUrl(playUrl: BiliTypes.BAPI.BiliPlayURL, cid: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat): BiliTypes.RES.Video.PlayURL {
        const durl = playUrl.data.durl[0]
        const quality = playUrl.data.quality
        if (!durl) {
            throw new Error("cannot create durl")
        }
        const url = durl.url
        if (!url) {
            throw new Error("source is got,but no video found")
        }
        const duration = Math.floor(durl.length / 1000)
        const pUrl: BiliTypes.RES.Video.PlayURL = {
            isDash: false,
            duration: duration,
            cid: cid,
            urlExpirationAt: this.getUrlExpirationAt(url),
            platform: platform,
            format: format,
            url: url,
            backupUrl: durl.backup_url || [],
            quality: quality,
        }
        return pUrl;
    }

    private createReqUrl(bvid: string, cid: number, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): URL {
        const url = new URL(this.BILI_VIDEO_PLAYURL_API)
        url.searchParams.append("bvid", String(bvid))
        url.searchParams.append('cid', String(cid))
        url.searchParams.append('qn', String(qn))
        url.searchParams.append('otype', 'json')
        url.searchParams.append('platform', String(platform))
        url.searchParams.append('high_quality', '1')
        url.searchParams.append('try_look', '1')
        url.searchParams.append('fnval', String(this.formatFnvalMap[format]))
        url.searchParams.append('fourk',"1")
        url.searchParams.append("fnver","0")
        return url
    }

    private async createWbiReqUrl(bvid: string, cid: number, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<URL> {
        const wbiUrl = new URL(this.BILI_VIDEO_WBI_PLAYURL_API)
        const params: Record<string, any> = {
            bvid, cid, qn, try_look: 1, platform: platform, high_quality: 1, otype: "json", fnval: this.formatFnvalMap[format],fourk:1,fnver:0
        }
        const signed = await this.BCrypto.signWbi(params)
        for (const [key, value] of signed.entries()) {
            wbiUrl.searchParams.append(key, value)
        }
        return wbiUrl
    }

    private async createAppReqUrl(bvid: string, cid: number, qn: number, platform: BiliTypes.PlatformAPPKEY, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<URL> {
        const params: Record<string, any> = {
            bvid,
            cid: String(cid),
            qn: String(qn),
            platform: platform.platform,
            ts: String(Math.floor(Date.now() / 1000)),
            otype: "json",
            fnval: this.formatFnvalMap[format],
            fourk:1,
            fnver:0
        };
        const signed: URLSearchParams = await this.BCrypto.signApp(params, platform);
        const url = new URL(this.BILI_VIDEO_PLAYURL_API)
        for (const [key, value] of signed.entries()) {
            url.searchParams.append(key, value)
        }
        return url
    }

    /**
     * @reload
     */
    protected async getStreamWebLike(
        bvid: string,
        cid: number,
        cookie: string,
        qn: number,
        platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">,
        format: 'dash'
    ): Promise<BiliTypes.RES.Video.PlayDash>;
    protected async getStreamWebLike(
        bvid: string,
        cid: number,
        cookie: string,
        qn: number,
        platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">,
        format: 'mp4'
    ): Promise<BiliTypes.RES.Video.PlayURL>;
    protected async getStreamWebLike(bvid: string, cid: number, cookie: string, qn: number, platform: Omit<BiliTypes.RES.Video.VideoPlayPlatform, "app">, format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash> {
        const urls: (() => URL | Promise<URL>)[] = [
            () => this.createReqUrl(bvid, cid, qn, platform, format),
            () => this.createWbiReqUrl(bvid, cid, qn, platform, format)
        ]
        for (const urlFunc of urls) {
            const url = await urlFunc()
            const headers = new Headers({
                'user-agent': this.BROWSER_UA,
                'referer': this.BILI_REFERER
            })
            headers.append('Cookie', cookie)
            const req = await proxyFetch(url, {
                headers: headers,
            })
            switch (format) {
                case "mp4":
                default:
                    const dataMp4 = await req.json<BiliTypes.BAPI.BiliPlayURL>()
                    if (dataMp4.code === 0 && dataMp4.data.durl[0]) {
                        return this.createPlayUrl(dataMp4, cid, platform as any, format)
                    }
                case "dash":
                    const dataDash = await req.json<BiliTypes.BAPI.BiliPlayDash>()
                    if (dataDash.code === 0 && dataDash.data.dash) {
                        return this.createPlayDash(dataDash, cid, platform as any, format)
                    }
            }
        }
        throw new Error(`cannot get video stream by web with format:${format},platform:${platform};if your platform is html5 and format is dash,it requires the server login,or an error will be throw like this;retry platform:pc with format:dash`)
    }

    protected async getStreamAppLike(
        bvid: string,
        cid: number,
        cookie: string,
        qn: number,
        platform: "app",
        format: 'dash'
    ): Promise<BiliTypes.RES.Video.PlayDash>;
    protected async getStreamAppLike(
        bvid: string,
        cid: number,
        cookie: string,
        qn: number,
        platform: "app",
        format: 'mp4'
    ): Promise<BiliTypes.RES.Video.PlayURL>;
    protected async getStreamAppLike(bvid: string, cid: number, cookie: string, qn: number, platform: "app", format: BiliTypes.RES.Video.VideoPlayFormat): Promise<BiliTypes.RES.Video.PlayDash | BiliTypes.RES.Video.PlayURL> {
        const urls: (() => Promise<[URL, string]>)[] = [
            async () => [await this.createAppReqUrl(bvid, cid, qn, BiliCrypto.PLATFORM_KEY.ios, format), BiliCrypto.PLATFORM_KEY.ios.ua],
            async () => [await this.createAppReqUrl(bvid, cid, qn, BiliCrypto.PLATFORM_KEY.tv, format), BiliCrypto.PLATFORM_KEY.tv.ua]
        ]
        for (const urlFunc of urls) {
            const [url, ua] = await urlFunc()
            const req = await proxyFetch(url, {
                headers: { 'User-Agent': ua }
            })
            switch (format) {
                case "mp4":
                default:
                    const dataMp4 = await req.json<BiliTypes.BAPI.BiliPlayURL>()
                    if (dataMp4.code === 0 && dataMp4.data.durl[0]) {
                        return this.createPlayUrl(dataMp4, cid, platform as any, format)
                    }
                case "dash":
                    const dataDash = await req.json<BiliTypes.BAPI.BiliPlayDash>()
                    if (dataDash.code === 0 && dataDash.data.dash) {
                        return this.createPlayDash(dataDash, cid, platform as any, format)
                    }
            }
        }
        throw new Error("cannot get video stream by app")
    }

    /**
     * @reload
     */
    public async getVideoPlayUrl(bvid: string, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: "mp4"): Promise<BiliTypes.RES.Video.PlayURL>
    public async getVideoPlayUrl(bvid: string, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: "dash"): Promise<BiliTypes.RES.Video.PlayDash>
    public async getVideoPlayUrl(bvid: string, cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform = 'html5', format: BiliTypes.RES.Video.VideoPlayFormat = 'mp4'): Promise<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash> {
        try {
            const cookie = await this.BCrypto.getBiliAntiCookie();
            switch (platform) {
                case "html5":
                case "pc":
                default:
                    // 针对此实现的调用已成功，但重载的实现签名在外部不可见
                    return this.getStreamWebLike(bvid, cid, cookie, qn, platform, format as any)
                case "app":
                    return this.getStreamAppLike(bvid, cid, cookie, qn, platform, format as any)
            }
        } catch (error) {
            throw new Error(`Cannot Get Play URL:${error}`)
        }
    }


    public async getVideoContentLength(videoUrl: string | URL): Promise<number | null> {
        try {
            const headReq = await fetch(videoUrl, {
                method: "HEAD",
                headers: {
                    "User-Agent": this.BROWSER_UA,
                    "Referer": this.BILI_REFERER
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
        const cookie = await this.BCrypto.getBiliAntiCookie();
        const url = new URL(this.BILI_DANMAKU_API)
        url.pathname = `${cid}.xml`
        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const isXML = req.headers.get('content-type') === 'text/xml' || req.headers.get('content-type') === 'application/xml'
        if (isXML) {
            const xmlText = await req.text()
            return xmlText
        }
        return null
    }

    public async getVideoSubtitles(bvid: string, cid: number): Promise<BiliTypes.RES.Subtitle.SubtitleItem[]> {
        const cookie = await this.BCrypto.getBiliAntiCookie(true)
        const url = new URL(this.BILI_PLAYERV2_API)
        const params = {
            bvid: bvid,
            cid: cid
        }
        const sign = await this.BCrypto.signWbi(params)
        for (const [key, value] of sign.entries()) {
            url.searchParams.append(key, value)
        }
        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
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