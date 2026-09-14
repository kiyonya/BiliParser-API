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
                'Cookie': cookie, 'Referer': this.BILI_REFERER, ...this.FAKE_BROWSER_HEADERS
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

    public async getUserFavList(fid: number, keyword?: string, page: number = 1, pageSize: number = 40):Promise<BiliTypes.RES.User.UserFav> {
        const url = new URL(this.BILI_FAV_LIST_API)
        url.searchParams.set("media_id", String(fid))
        keyword && url.searchParams.set("keyword", String(keyword))
        url.searchParams.set("pn", String(page))
        url.searchParams.set("ps", String(pageSize))
        url.searchParams.set("order", "mtime")

        const cookie = await this.BCrypto.getBiliAntiCookie()
        const req = await proxyFetch(url, {
            headers: {
                'Cookie': cookie, 'Referer': this.BILI_REFERER, ...this.FAKE_BROWSER_HEADERS
            }
        })
        const res = await req.json<BiliTypes.BAPI.BiliUserFav>()
        if (res.code !== 0) {
            throw new Error(`cannot get fav list: ${res.message}`)
        }

        const data = res.data
        const result: BiliTypes.RES.User.UserFav = {
            fid: data.info.id, //fuck about that,fid is not "fid"
            pic: data.info.cover,
            creator: {
                uid: data.info.upper.mid,
                name: data.info.upper.name,
                face: data.info.upper.face
            },
            ctime: data.info.ctime,
            mtime: data.info.mtime,
            medias: (data.medias || []).map(i => ({
                aid: i.id,
                bvid: i.bvid,
                cid: i.ugc?.first_cid ?? 0,
                duration: i.duration,
                title: i.title,
                desc: i.intro,
                pic: i.cover,
                owner: {
                    uid: i.upper.mid,
                    name: i.upper.name,
                    face: i.upper.face
                }
            }))
        }

        return result
    }

}