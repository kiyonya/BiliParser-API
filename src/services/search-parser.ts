import { BiliTypes } from "../types";
import Parser from "../utils/parser";
import { proxyFetch } from "../utils/proxy-fetch";

type SearchAPIResult = BiliTypes.BAPI.BiliSearchVideo | BiliTypes.BAPI.BiliSearchUser | BiliTypes.BAPI.BiliSearchLive
type SearchResult = BiliTypes.RES.Search.SearchLiveItem | BiliTypes.RES.Search.SearchUserItem | BiliTypes.RES.Search.SearchVideoItem
export default class BiliSearchParser extends Parser {

    public async search(keyword: string, type: "video", page?: number, pageSize?: number, order?: string): Promise<BiliTypes.RES.Search.SearchVideoItem>
    public async search(keyword: string, type: "up", page?: number, pageSize?: number, order?: string): Promise<BiliTypes.RES.Search.SearchUserItem>
    public async search(keyword: string, type: "live", page?: number, pageSize?: number, order?: string): Promise<BiliTypes.RES.Search.SearchLiveItem>
    public async search(keyword: string, type: BiliTypes.RES.Search.SearchType, page: number = 1, pageSize: number = 20, order?: string): Promise<SearchResult> {
        const cookie = await this.BCrypto.getBiliAntiCookie()
        const url = new URL(this.BILI_SEARCH_TYPE_API)
        const params: Record<string, string> = {
            keyword: keyword,
            page: String(page),
            t: String(Date.now()),
            page_size: String(pageSize)
        }
        if (order) {
            params['order'] = order
        }
        switch (type) {
            case "video":
                params["search_type"] = "video"
                break
            case "up":
                params["search_type"] = "bili_user"
                params["user_type"] = "1"
                break
            case 'live':
                params["search_type"] = "live_room"
                break
        }
        const sign = await this.BCrypto.signWbi(params)
        for (const [k, v] of Object.entries(sign)) {
            url.searchParams.set(k, v)
        }
        const req = await proxyFetch(url, {
            headers: {
                ...this.FAKE_BROWSER_HEADERS, 'Cookie': cookie, 'Referer': this.BILI_SEARCH_REFERER
            }
        })
        const data = await req.json<SearchAPIResult>()
        if (data.code !== 0) {
            throw new Error(`search request not ok with code ${data.code}`)
        }
        if (data.data?.['v_voucher']) {
            throw new Error(`need captcha validation! please try again later`)
        }
        switch (type) {
            case "video":
                return this.toVideoPage(data as BiliTypes.BAPI.BiliSearchVideo)
            case "up":
                return this.toUserPage(data as BiliTypes.BAPI.BiliSearchUser)
            case "live":
                return this.toLivePage(data as BiliTypes.BAPI.BiliSearchLive)
        }
        throw new Error("cannot get search result")
    }

    private stripHtml(value: string): string {
        return value
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ")
    }

    private parseDuration(value: string): number {
        if (!value) {
            return 0
        }
        const parts = value.split(":").map(i => parseInt(i))
        if (parts.some(i => Number.isNaN(i))) {
            return 0
        }
        return parts.reduce((total, part) => total * 60 + part, 0)
    }

    private toVideoPage(data: BiliTypes.BAPI.BiliSearchVideo): BiliTypes.RES.Search.SearchVideoItem {
        const body = data.data
        const result: BiliTypes.RES.Search.SearchVideoItem = {
            page: Number(body.page) || 0,
            pageSize: Number(body.pageSize) || 0,
            numResults: Number(body.numResults) || 0,
            numPages: Number(body.numPages) || 0,
            results: (body.result || []).filter(i => i.type === "video").map(i => ({
                type: "video",
                aid: i.aid,
                bvid: i.bvid,
                title: this.stripHtml(i.title),
                desc: this.stripHtml(i.description || i.desc || ""),
                pic: "https:" + i.pic,
                tag: i.tag,
                duration: this.parseDuration(i.duration),
                owner: {
                    mid: i.mid,
                    name: i.author,
                    face: i.upic
                }
            }))
        }
        return result
    }

    private toUserPage(data: BiliTypes.BAPI.BiliSearchUser): BiliTypes.RES.Search.SearchUserItem {
        const body = data.data
        const result: BiliTypes.RES.Search.SearchUserItem = {
            page: Number(body.page) || 0,
            pageSize: Number(body.pageSize) || 0,
            numResults: Number(body.numResults) || 0,
            numPages: Number(body.numPages) || 0,
            results: (body.result || []).filter(i => i.type === "bili_user").map(i => ({
                type: "bili_user",
                uid: i.mid,
                name: i.uname,
                sign: i.usign,
                fans: i.fans,
                videos: i.videos,
                pic: "https:" + i.upic,
                level: i.level,
                latestVideos: (i.res || []).map(v => ({
                    aid: v.aid,
                    bvid: v.bvid,
                    title: this.stripHtml(v.title),
                    pic: "https:" + v.pic
                }))
            }))
        }
        return result
    }

    private toLivePage(data: BiliTypes.BAPI.BiliSearchLive): BiliTypes.RES.Search.SearchLiveItem {
        const body = data.data
        const result: BiliTypes.RES.Search.SearchLiveItem = {
            page: Number(body.page) || 0,
            pageSize: Number(body.pageSize) || 0,
            numResults: Number(body.numResults) || 0,
            numPages: Number(body.numPages) || 0,
            results: (body.result || []).filter(i => i.type === "live_room").map(i => ({
                type: "live",
                roomId: i.roomid,
                title: this.stripHtml(i.title),
                tag: i.tags,
                pic: "https:" + i.pic,
                liveTime: i.live_time,
                online: i.online,
                attentions: i.attentions,
                liveUser: {
                    uid: i.uid,
                    name: i.uname,
                    face: "https:" + i.uface
                },
            }))
        }
        return result
    }
}