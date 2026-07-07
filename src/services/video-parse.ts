import { BiliTypes } from "../types"
import BiliCrypto from "../utils/bili-crypto"
import { proxyFetch } from "../utils/proxy-fetch"

export default class BiliVideoParser {

    private BILI_VIDEO_VIEW_API = "https://api.bilibili.com/x/web-interface/view"
    private BILI_VIDEO_H5_PLAYURL_API = "https://api.bilibili.com/x/player/playurl"
    private BILI_VIDEO_APP_PLAYURL_API = "https://api.bilibili.com/x/player/playurl"
    private BILI_VIDEO_WBI_PLAYURL_API = "https://api.bilibili.com/x/player/wbi/playurl"
    private BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    private BILI_REFERER = "https://www.bilibili.com"

    private BCrypto = new BiliCrypto()

    public async parseBiliVideo(bvid: string, qn: number, platform?: BiliTypes.GetURLPlatform): Promise<BiliTypes.BiliPlayResult> {

        const cookie = await this.BCrypto.getBiliAntiCookie();
        const infoURL = new URL(this.BILI_VIDEO_VIEW_API)
        infoURL.searchParams.append('bvid', bvid)

        const req = await proxyFetch(infoURL, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })

        const data = await req.json<BiliTypes.API.BiliVideoInfo>()
        if (data.code !== 0) throw new Error(data.message);

        const headData = data.data
        if (!headData) {
            throw new Error()
        }

        const cid = headData.cid as number
        const duration = headData.duration
        const aid = headData.aid
        const cover = headData.pic || ""
        const title = headData.title || ""
        const desc = headData.desc || ""
        const owner = headData.owner || { mid: 0, name: "", face: "" }

        const { url, quality, method: parsedPlatform } = await this.getBiliPlayURL(bvid, cid, qn, platform)

        let expirationS: number
        try {
            const playURL = new URL(url)
            if (playURL.searchParams.has('deadline')) {
                expirationS = (parseInt(playURL.searchParams.get('deadline') as string))
            }
            else {
                expirationS = Date.now() + 3 * duration
            }
        } catch (error) {
            expirationS = Date.now() + 3 * duration
        }

        const result: BiliTypes.BiliPlayResult = {
            bvid: bvid,
            aid: aid,
            cid: cid,
            url: url,
            pic: cover,
            duration: duration,
            title: title,
            desc: desc,
            owner: owner,
            quality: quality,
            platform: parsedPlatform,
            urlExpirationS: expirationS
        }
        return result
    }

    private async getBiliPlayURL(bvid: string, cid: number, qn: number = 64, platform?: BiliTypes.GetURLPlatform): Promise<{ url: string, quality: number, method: BiliTypes.GetURLPlatform }> {

        const cookie = await this.BCrypto.getBiliAntiCookie();

        const tasks: (() => Promise<{ url: string, quality: number, method: BiliTypes.GetURLPlatform }>)[] = []
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
                return await task()
            } catch (error) {
            }
        }

        throw new Error('Cannot Get Play URL')
    }

    private async getPlayURLFromH5(bvid: string, cid: number, cookie: string, qn: number): Promise<{ url: string, quality: number, method: BiliTypes.GetURLPlatform }> {

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
        const data = await req.json<BiliTypes.API.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                method: "web"
            }
        }
        throw new Error(data.message);
    }

    private async getPlayURLFromAPP(platform: BiliTypes.PlatformAPPKEY, bvid: string, cid: number, qn: number): Promise<{ url: string, quality: number, method: BiliTypes.GetURLPlatform }> {

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

        const data = await req.json<BiliTypes.API.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                method: "app"
            }
        }

        throw new Error(data.message);
    }

    private async getPlayURLFromWBI(bvid: string, cid: number, cookie: string, qn: number): Promise<{ url: string, quality: number, method: BiliTypes.GetURLPlatform }> {
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

        const data = await req.json<BiliTypes.API.BiliPlayURL>()
        if (data.code === 0 && data.data.durl?.[0]?.url) {
            return {
                url: data.data.durl?.[0]?.url,
                quality: data.data.quality,
                method: "web"
            }
        }

        throw new Error(data.message);
    }
}