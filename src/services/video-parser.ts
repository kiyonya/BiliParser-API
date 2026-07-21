import { BiliTypes } from "../types"
import BiliCrypto from "../utils/bili-crypto"
import Parser from "../utils/parser"
import { proxyFetch } from "../utils/proxy-fetch"

export interface GetPlayURLTaskReturns {
    url: string, quality: number, platform: BiliTypes.BVideoPlatform
}

export default class BiliVideoParser extends Parser {

    public async getVideoInfo(bvid: string): Promise<BiliTypes.RES.Video.VideoInfo> {
        const cookie = await this.BCrypto.getBiliAntiCookie();
        const videoViewInfoURL = new URL(this.BILI_VIDEO_VIEW_API)
        videoViewInfoURL.searchParams.append('bvid', bvid)
        const videoViewReq = await proxyFetch(videoViewInfoURL, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const videoViewData = await videoViewReq.json<BiliTypes.BAPI.BiliVideoViewInfo>()
        if (videoViewData.code === 0) {
            //正常 其他的情况走fallback
            const headData = videoViewData.data
            const cid = headData.cid as number
            const duration = headData.duration
            const aid = headData.aid
            const cover = headData.pic || ""
            const title = headData.title || ""
            const desc = headData.desc || ""
            const owner = headData.owner || { mid: 0, name: "", face: "" }
            const info: BiliTypes.RES.Video.VideoInfo = {
                bvid: bvid,
                aid: aid,
                cid: cid,
                pic: cover,
                duration: duration,
                title: title,
                desc: desc,
                owner: owner,
                info_source: 'view'
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
            const data = videoCidData.data[0]
            const cid = data.cid as number
            const duration = data.duration
            const aid = -1
            const cover = data.first_frame || ""
            const title = data.part || ""
            const desc = ""
            const owner = { mid: 0, name: "", face: "" }
            const info: BiliTypes.RES.Video.VideoInfo = {
                bvid: bvid,
                aid: aid,
                cid: cid,
                pic: cover,
                duration: duration,
                title: title,
                desc: desc,
                owner: owner,
                info_source: 'fallback'
            }
            return info
        }

        throw new Error("cannot get bili video info")
    }

    public async getVideoPlayUrl(bvid: string, cid: number, qn: number = 64, platform?: BiliTypes.BVideoPlatform): Promise<BiliTypes.RES.Video.PlayURL> {

        const cookie = await this.BCrypto.getBiliAntiCookie();
        const tasks: (() => Promise<GetPlayURLTaskReturns>)[] = []
        switch (platform) {
            case "web":
            default:
                tasks.push(async () => this.getPlayURLFromH5(bvid, cid, cookie, qn))
                tasks.push(async () => this.getPlayURLFromWBI(bvid, cid, cookie, qn))
                break
            case "app":
                tasks.push(async () => this.getPlayURLFromAPP(BiliCrypto.PLATFORM_KEY.ios, bvid, cid, qn), async () => this.getPlayURLFromAPP(BiliCrypto.PLATFORM_KEY.tv, bvid, cid, qn))
                break
        }
        for (const task of tasks) {
            try {
                const { url, quality, platform } = await task()
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
                const data: BiliTypes.RES.Video.PlayURL = {
                    url: url,
                    quality: quality,
                    platform: platform,
                    urlExpirationAt: urlExpirationAt
                }
                return data
            } catch (error) {
                continue
            }
        }

        throw new Error('Cannot Get Play URL')
    }

    private async getPlayURLFromH5(bvid: string, cid: number, cookie: string, qn: number): Promise<GetPlayURLTaskReturns> {

        const url = new URL(this.BILI_VIDEO_H5_PLAYURL_API)
        url.searchParams.append("bvid", String(bvid))
        url.searchParams.append('cid', String(cid))
        url.searchParams.append('qn', String(qn))
        url.searchParams.append('otype', 'json')
        url.searchParams.append('platform', 'html5')
        url.searchParams.append('high_quality', '1')
        url.searchParams.append('fnval', '1')

        const xHeaders = new Headers({
            'user-agent': this.BROWSER_UA,
            'referer': this.BILI_REFERER
        })
        xHeaders.append('Cookie', cookie)

        const req = await proxyFetch(url, {
            headers: xHeaders,
        })
        const data = await req.json<BiliTypes.BAPI.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                platform: "web"
            }
        }
        throw new Error(data.message);
    }

    private async getPlayURLFromAPP(platform: BiliTypes.PlatformAPPKEY, bvid: string, cid: number, qn: number): Promise<GetPlayURLTaskReturns> {

        const params = {
            bvid,
            cid: String(cid),
            qn: String(qn),
            fnval: '1',
            fnver: '0',
            fourk: '1',
            platform: platform.platform,
            ts: String(Math.floor(Date.now() / 1000))
        };

        const signed: URLSearchParams = await this.BCrypto.signApp(params, platform);
        const url = new URL(this.BILI_VIDEO_APP_PLAYURL_API)
        for (const [key, value] of signed.entries()) {
            url.searchParams.append(key, value)
        }

        const req = await proxyFetch(url, {
            headers: { 'User-Agent': platform.ua }
        })

        const data = await req.json<BiliTypes.BAPI.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                platform: "app"
            }
        }

        throw new Error(data.message);
    }

    private async getPlayURLFromWBI(bvid: string, cid: number, cookie: string, qn: number): Promise<GetPlayURLTaskReturns> {
        const params = {
            bvid, cid, qn, fnval: 1, try_look: 1, platform: 'html5', high_quality: 1
        }

        const sign = await this.BCrypto.signWbi(params)
        const url = new URL(this.BILI_VIDEO_WBI_PLAYURL_API)
        for (const [key, value] of sign.entries()) {
            url.searchParams.append(key, value)
        }

        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        });

        const data = await req.json<BiliTypes.BAPI.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                platform: "web"
            }
        }

        throw new Error(data.message);
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
}