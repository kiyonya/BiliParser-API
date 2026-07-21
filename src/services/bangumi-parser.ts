import { BiliTypes } from "../types"
import Parser from "../utils/parser"
import { proxyFetch } from "../utils/proxy-fetch"

export default class BiliBangumiParser extends Parser {

    public async getBangumiInfo(id: number | string, idType: 'ssid' | 'epid' | 'mdid'): Promise<BiliTypes.RES.Bangumi.BangumiInfo> {
        const url = new URL(this.BILI_BANGUMI_INFO_API)
        switch (idType) {
            case "ssid":
            case 'mdid':
                url.searchParams.append('season_id', String(id))
                break
            case "epid":
                url.searchParams.append('ep_id', String(id))
                break
        }
        const cookie = await this.BCrypto.getBiliAntiCookie()
        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const data = await req.json<BiliTypes.BAPI.BiliBangumiInfo>()
        if (data.code !== 0 || !data.result) {
            throw new Error('cannot get bangumi info:' + data.message)
        }
        const result = data.result
        const info: BiliTypes.RES.Bangumi.BangumiInfo = {
            seasonId: result.season_id,
            title: result.season_title,
            cover: result.cover,
            actors: result.actors,
            evaluate: result.evaluate,
            seasons: (result.seasons || []).map(i => ({
                seasonId: i.season_id,
                cover: i.cover,
                title: i.season_title
            }))
        }
        return info
    }

    public async getBangumiEpisodes(id: number | string, idType: 'ssid' | 'mdid'): Promise<BiliTypes.RES.Bangumi.BangumiEpisode> {
        const url = new URL(this.BILI_BANGUMI_EPISODE_API)
        switch (idType) {
            case "ssid":
            case "mdid":
                url.searchParams.append('season_id', String(id))
        }
        const cookie = await this.BCrypto.getBiliAntiCookie()
        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })
        const data = await req.json<BiliTypes.BAPI.BiliBangumiEpisode>()
        if (data.code !== 0 || !data.result || !data.result?.main_section?.episodes?.length) {
            throw new Error('cannot get episode:' + data.message)
        }

        const episodes: BiliTypes.RES.Bangumi.BangumiEpisode['episodes'] = []
        const result = data.result
        for (const ep of result.main_section.episodes || []) {
            episodes.push({
                title: ep.long_title,
                link: ep.share_url,
                status: ep.status,
                epid: ep.id,
                aid: ep.aid,
                cid: ep.cid,
                cover: ep.cover
            })
        }
        return {
            episodes: episodes
        }
    }

    public async getBangumiPlayUrl(epid: number, qn: number): Promise<BiliTypes.RES.Bangumi.BangumiPlayURL> {
        const url = new URL(this.BILI_BANGUMI_PLAYURL_API)
        url.searchParams.append('ep_id', String(epid))
        url.searchParams.append('qn', String(qn))
        url.searchParams.append('fnver', '0')
        url.searchParams.append('fourk', '1')

        const cookie = await this.BCrypto.getBiliAntiCookie()
        const req = await proxyFetch(url, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        })

        const data = await req.json<BiliTypes.BAPI.BiliBangumiPlayURL>()
        if (data.code !== 0 || !data.result) {
            throw new Error('cannot get playurl' + data.message)
        }
        const result = data.result
        const durl = result.durl[0]
        if (!durl) {
            throw new Error()
        }
        const mainURL = durl.url
        const backups = (durl.backup_url || [])
        const duration = Math.floor(result.timelength / 1000)
        const expirations: number[] = []
        for (const url of [...backups, mainURL]) {
            try {
                const u = new URL(url)
                if (u.searchParams.has('deadline')) {
                    expirations.push(parseInt(u.searchParams.get('deadline') as string))
                }
                else {
                    expirations.push(Math.floor(Date.now() / 1000) + duration)
                }
            } catch (_) {
                expirations.push(Math.floor(Date.now() / 1000) + duration)
            }
        }
        const expiration = Math.min(...expirations)

        return {
            url: mainURL,
            backups: backups,
            urlExpirationAt: expiration,
            quality: result.quality,
            duration: duration
        }
    }
}