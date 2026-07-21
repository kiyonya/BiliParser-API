// 用户创建的合集

import { BiliTypes } from "../types";
import Parser from "../utils/parser";
import { proxyFetch } from "../utils/proxy-fetch";

export default class BiliUserParser extends Parser {
    
    public async getUserSeasonArchieves(mid: number, seasonId: number, sortReverse: boolean = false, page: number = 1, pageSize: number = 30): Promise<BiliTypes.RES.User.UserArchieves> {

        const url = new URL(this.BILI_SEASONS_ARCHIVES_API)
        url.searchParams.append('mid', String(mid))
        url.searchParams.append('season_id', String(seasonId))
        url.searchParams.append('sort_reverse', String(sortReverse))
        url.searchParams.append('page_size', String(pageSize))
        url.searchParams.append('page_num', String(page))

        const cookie = await this.BCrypto.getBiliAntiCookie()
        const req = await proxyFetch(url, {
            headers: {
                'User-Agent': this.BROWSER_UA, 'Cookie': cookie, 'Referer': this.BILI_REFERER
            }
        })

        const res = await req.json<BiliTypes.BAPI.UGCSeason.SeasonsArchives>()
        if (res.code !== 0) {
            throw new Error(`cannot get archieves list: ${res.message}`)
        }

        const result: BiliTypes.RES.User.UserArchieves = {
            mid: mid,
            seasonId: seasonId,
            archieves: res.data.archives.map(i => ({
                cover: i.pic,
                aid: i.aid,
                bvid: i.bvid,
                title: i.title,
                duration: i.duration
            })),
            pages: {
                page: res.data.page.page_num,
                pageSize: res.data.page.page_size,
                total: res.data.page.total
            }
        }

        return result
    }

}