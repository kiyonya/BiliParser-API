import { Config } from "./config"
import { BiliTypes } from "../types"
import { md5String } from "../utils/hashlib"

export default abstract class SharedData {
    public static readonly SERVER_VERSION = Config.SERVER_VERSION
    public static readonly CACHE_DATA_VERSION = Config.CACHE_DATA_VERSION
    public static readonly BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    public static readonly MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    public static readonly FAKE_BROWSER_HEADERS = {
        'User-Agent': SharedData.BROWSER_UA,
        'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'accept': '*/*',
    }
    public static readonly BILI_REFERER = "https://www.bilibili.com"
    public static readonly BILI_LIVE_REFERER = "https://live.bilibili.com"
    public static readonly BILI_SEARCH_REFERER = "https://search.bilibili.com/all"
    public static readonly BILI_CID_BACKUP_API = "https://api.bilibili.com/x/player/pagelist"
    public static readonly BILI_VIDEO_VIEW_API = "https://api.bilibili.com/x/web-interface/view"
    public static readonly BILI_SEARCH_TYPE_API = "https://api.bilibili.com/x/web-interface/wbi/search/type"
    public static readonly BILI_VIDEO_PLAYURL_API = "https://api.bilibili.com/x/player/playurl"
    public static readonly BILI_VIDEO_WBI_PLAYURL_API = "https://api.bilibili.com/x/player/wbi/playurl"
    public static readonly BILI_BANGUMI_INFO_API = "https://api.bilibili.com/pgc/view/web/simple/season"
    public static readonly BILI_BANGUMI_EPISODE_API = "https://api.bilibili.com/pgc/web/season/section"
    public static readonly BILI_BANGUMI_PLAYURL_API = "https://api.bilibili.com/pgc/player/web/playurl"
    public static readonly BILI_LIVE_INFO_API = "https://api.live.bilibili.com/room/v1/Room/get_info"
    public static readonly BILI_LIVE_PLAYURL_API = "https://api.live.bilibili.com/room/v1/Room/playUrl"
    public static readonly BILI_LIVE_XLIVE_API = "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo"
    public static readonly BILI_SEASONS_ARCHIVES_API = "https://api.bilibili.com/x/polymer/web-space/seasons_archives_list"
    public static readonly BILI_DANMAKU_API = "https://comment.bilibili.com/"
    public static readonly BILI_PLAYERV2_API = "https://api.bilibili.com/x/player/wbi/v2"
    public static readonly BILI_FAV_LIST_API = "https://api.bilibili.com/x/v3/fav/resource/list"
    public static readonly BILI_FINGER_SPI = "https://api.bilibili.com/x/frontend/finger/spi"
    public static readonly BILI_WEB_TICKET_API = "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket"
    public static readonly BILI_WEB_NAV = "https://api.bilibili.com/x/web-interface/nav"
    public static readonly BILI_MIXIN_KEY_ENC = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]
    public static readonly BILI_DEFAULT_BUVID3 = "0A4418BE-BDC0-7F8C-39DE-3A6BBBB9A04D59416infoc"
    public static readonly PLATFORM_KEY: { ios: BiliTypes.PlatformAPPKEY, tv: BiliTypes.PlatformAPPKEY } = {
        ios: { appkey: 'YvirImLGlLANCLvM', appsec: 'JNlZNgfNGKZEpaDTkCdPQVXntXhuiJEM', platform: 'ios', ua: 'Bilibili/8.0.0 (bbcallen@gmail.com)' },
        tv: { appkey: '4409e2ce8ffd12b8', appsec: '59b43e04ad6965f34319062b478f83dd', platform: 'android', ua: 'Bilibili Freedoooooom/MOD' }
    };
    public static readonly URLPatterns = {
        BILI_HOST: new URLPattern("*://*bilibili.com/*"),
        B23_TV: new URLPattern("*://b23.tv/*"),
        BILI_VIDEO: new URLPattern("*://*bilibili.com/video/*"),
        BILI_LIVE: new URLPattern('*://live.bilibili.com/*')
    }

    public static readonly cacheKey = {
        cookie: () => `${SharedData.CACHE_DATA_VERSION}:BILI_COMMON_COOKIES`,
        videoInfo: (bvid: string) => {
            return `${SharedData.CACHE_DATA_VERSION}:videoInfo:${bvid}`
        },
        videoPlayUrl: (cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat, loginKey: string) => {
            return `${SharedData.CACHE_DATA_VERSION}:videoPlayUrl:${loginKey}:${cid}:${qn}:${platform}:${format}`
        },
        videoSubtitles: (cid: number) => {
            return `${SharedData.CACHE_DATA_VERSION}:subtitle:${cid}`
        },
        userArchieves: (mid: number, seasonId: number, page: number, pageSize: number) => {
            return `${SharedData.CACHE_DATA_VERSION}:userArchieves:${mid}:${seasonId}:${page}:${pageSize}`
        },
        userFav: (fid: number, keyword: string | undefined, page: number, pageSize: number) => {
            const keywordHash = keyword ? md5String(keyword.trim()) : "all"
            return `${SharedData.CACHE_DATA_VERSION}:userFav:${fid}:${keywordHash}:${page}:${pageSize}`
        },
        bangumiInfo: (seasonId?: number, episodeId?: number) => {
            if (seasonId) {
                return `${SharedData.CACHE_DATA_VERSION}:bangumiInfo:season:${seasonId}`
            }
            return `${SharedData.CACHE_DATA_VERSION}:bangumiInfo:episode:${episodeId}`
        },
        bangumiEpisodes: (seasonId?: number) => {
            return `${SharedData.CACHE_DATA_VERSION}:bangumiEpisodes:season:${seasonId}`
        },
        danmaku: (cid: number) => {
            return `${SharedData.CACHE_DATA_VERSION}:danmaku:${cid}`
        },
        danmakuJSON: (bvid: string, p: number) => {
            return `${SharedData.CACHE_DATA_VERSION}:danmakuJSON:${bvid}:${p}`
        },
        live: (roomId: number, platform: "xlive" | "h5", codec: "avc" | "hevc", format: "fmp4" | "flv" | "ts", protocol: "stream" | "hls") => {
            return `${SharedData.CACHE_DATA_VERSION}:live:${roomId}:${platform}:${codec}:${format}:${protocol}`
        },
        search: (keyword: string, type: BiliTypes.RES.Search.SearchType, page: number, pageSize: number, order?: string) => {
            const keywordHash = md5String(keyword.trim())
            const key = `${SharedData.CACHE_DATA_VERSION}:search:${type}:${keywordHash}:${page}:${pageSize}:${order ? order : "common_order"}`
            return key
        }
    }
}