import { AppContext } from "../types"
import BiliCrypto from "./bili-crypto"

export default abstract class Parser {

    protected BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    protected MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    protected FAKE_BROWSER_HEADERS = {
        'User-Agent': this.BROWSER_UA,
        'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'accept':'*/*',
    }

    protected BILI_REFERER = "https://www.bilibili.com"
    protected BILI_LIVE_REFERER = "https://live.bilibili.com"
    protected BILI_SEARCH_REFERER = "https://search.bilibili.com/all"

    protected BILI_CID_BACKUP_API = "https://api.bilibili.com/x/player/pagelist"
    protected BILI_VIDEO_VIEW_API = "https://api.bilibili.com/x/web-interface/view"
    protected BILI_SEARCH_TYPE_API = "https://api.bilibili.com/x/web-interface/wbi/search/type"
    protected BILI_VIDEO_PLAYURL_API = "https://api.bilibili.com/x/player/playurl"
    protected BILI_VIDEO_WBI_PLAYURL_API = "https://api.bilibili.com/x/player/wbi/playurl"
    protected BILI_BANGUMI_INFO_API = "https://api.bilibili.com/pgc/view/web/simple/season"
    protected BILI_BANGUMI_EPISODE_API = "https://api.bilibili.com/pgc/web/season/section"
    protected BILI_BANGUMI_PLAYURL_API = "https://api.bilibili.com/pgc/player/web/playurl"
    protected BILI_LIVE_INFO_API = "https://api.live.bilibili.com/room/v1/Room/get_info"
    protected BILI_LIVE_PLAYURL_API = "https://api.live.bilibili.com/room/v1/Room/playUrl"
    protected BILI_LIVE_XLIVE_API = "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo"
    protected BILI_SEASONS_ARCHIVES_API = "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list"
    protected BILI_DANMAKU_API = "https://comment.bilibili.com/"
    protected BILI_PLAYERV2_API = "https://api.bilibili.com/x/player/wbi/v2"
    protected BILI_FAV_LIST_API = "https://api.bilibili.com/x/v3/fav/resource/list"

    protected ctx: AppContext
    protected BCrypto: BiliCrypto

    constructor(ctx: AppContext) {
        this.ctx = ctx
        this.BCrypto = new BiliCrypto(ctx)
    }
}