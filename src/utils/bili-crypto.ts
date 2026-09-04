import { Config } from "../config";
import { AppContext, BiliTypes } from "../types";
import CacheableObject from "./cache";
import { hmacSha256, md5String } from "./hashlib";
import { proxyFetch } from "./proxy-fetch";

export default class BiliCrypto {

    protected ctx: AppContext
    constructor(ctx: AppContext) {
        this.ctx = ctx
    }

    private BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    private BILI_FINGER_SPI = "https://api.bilibili.com/x/frontend/finger/spi"
    private BILI_REFERER = "https://www.bilibili.com"
    private BILI_WEB_TICKET_API = "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket"
    private BILI_WEB_NAV = "https://api.bilibili.com/x/web-interface/nav"
    private BILI_MIXIN_KEY_ENC = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]
    private readonly BILI_DEFAULT_BUVID3 = "0A4418BE-BDC0-7F8C-39DE-3A6BBBB9A04D59416infoc"

    public static readonly PLATFORM_KEY: { ios: BiliTypes.PlatformAPPKEY, tv: BiliTypes.PlatformAPPKEY } = {
        ios: { appkey: 'YvirImLGlLANCLvM', appsec: 'JNlZNgfNGKZEpaDTkCdPQVXntXhuiJEM', platform: 'ios', ua: 'Bilibili/8.0.0 (bbcallen@gmail.com)' },
        tv: { appkey: '4409e2ce8ffd12b8', appsec: '59b43e04ad6965f34319062b478f83dd', platform: 'android', ua: 'Bilibili Freedoooooom/MOD' }
    };

    public biliAntiCookie: string | null = null
    public biliWbiMixinKey: string | null = null

    public async getBiliAntiCookie(): Promise<string> {
        if (!this.biliAntiCookie) {
            this.biliAntiCookie = await this.createBiliAntiCookie()
        }
        return this.biliAntiCookie
    }

    public async getBiliWbiMixinKey(): Promise<string> {
        if (!this.biliWbiMixinKey) {
            this.biliWbiMixinKey = await this.createBiliWbiMixinKey()
        }
        return this.biliWbiMixinKey
    }

    private randomBlsid(tms = Date.now()) {
        const toHex = (n: number) => Math.ceil(n).toString(16).toUpperCase();
        let randomPart = '';
        for (let i = 0; i < 8; i++) {
            randomPart += Math.floor(Math.random() * 16).toString(16).toUpperCase();
        }
        return `${randomPart}_${toHex(tms)}`;
    }

    private randomUUID(tms = Date.now()) {
        const uuid = crypto.randomUUID().toUpperCase()
        const buuid = uuid + String(tms % 1e5).padStart(5, "0") + "infoc"
        return buuid
    }

    private async createBiliAntiCookie(): Promise<string> {

        const cookiesCacheKey = `${Config.CACHE_DATA_VERSION}:BILI_COMMON_COOKIES`
        let cookies = await this.ctx.cache.getCache<Record<string, string>>(cookiesCacheKey, undefined, 'kv', false)
        if (!cookies) {
            const signTs = Date.now()
            this.ctx.header('X-Bcrypto-Cookies-Cache', 'MISS')
            this.ctx.header('X-Bcrypto-Sign-Time', String(signTs))
            let buvid3 = this.BILI_DEFAULT_BUVID3;
            let buvid4 = null;
            let ticket: string | null = null
            let cookieCacheOk = true
            try {
                const res = await proxyFetch(this.BILI_FINGER_SPI);
                const json = await res.json<BiliTypes.BAPI.FingerSPI>();
                if (json.data?.b_3) buvid3 = json.data.b_3;
                if (json.data?.b_4) buvid4 = json.data.b_4;

            } catch (e) {
                cookieCacheOk = false
            }
            try {
                const ts = Math.floor(Date.now() / 1000);
                const hexsign = hmacSha256('XgwSnGZ1p', 'ts' + ts);
                const webTicketURL = new URL(this.BILI_WEB_TICKET_API)
                webTicketURL.searchParams.append('key_id', 'ec02')
                webTicketURL.searchParams.append('hexsign', hexsign)
                webTicketURL.searchParams.append('context[ts]', String(ts))
                webTicketURL.searchParams.append('csrf', '')

                const res = await proxyFetch(webTicketURL, { method: 'POST', headers: { "User-Agent": this.BROWSER_UA } });
                const json = await res.json<BiliTypes.BAPI.BiliWebTicket>();
                if (json.data?.ticket) {
                    ticket = json.data.ticket
                }
            } catch (e) {
                cookieCacheOk = false
            }
            cookies = {
                "enable_web_push": "DISABLE",
                "b_lsid": this.randomBlsid(signTs),
                "theme_style": "light",
                "_uuid": this.randomUUID(signTs),
                "buvid3": buvid3,
                ...(ticket ? { "bili_ticket": ticket } : {}),
                ...(buvid4 ? { "buvid4": buvid4 } : {})
            }
            if (cookieCacheOk) {
                const expirationAt = Math.floor(signTs / 1000) + Config.COOKIES_SIGN_CACHE_TIME
                await this.ctx.cache.setCache(cookiesCacheKey, cookies, () => {
                    return expirationAt
                }, undefined, 'kv')
            }
        }
        else {
            this.ctx.header('X-Bcrypto-Cookies-Cache', 'HIT')
        }

        if (Config.ENABLE_CUSTOM_COOKIES && process.env.CONFIG_CustomCookies) {
            cookies = {
                ...cookies,
                ...this.parseCookiesMap(process.env.CONFIG_CustomCookies)
            }
        }
        let parts: string[] = []
        for (const [k, v] of Object.entries(cookies)) {
            parts.push(`${k}=${v}`)
        }
        return parts.join("; ")
    }

    private parseCookiesMap(cookies: string): Record<string, string> {
        const cookieMap: Record<string, string> = {};
        if (!cookies || cookies.trim() === '') {
            return cookieMap;
        }
        const cookiePairs = cookies.split(';');

        for (const pair of cookiePairs) {
            const trimmedPair = pair.trim();
            if (trimmedPair === '') continue;
            const equalIndex = trimmedPair.indexOf('=');
            if (equalIndex === -1) {
                cookieMap[trimmedPair] = '';
            } else {
                const key = trimmedPair.substring(0, equalIndex).trim();
                let value = trimmedPair.substring(equalIndex + 1).trim();
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                cookieMap[key] = value;
            }
        }

        return cookieMap;
    }

    private async createBiliWbiMixinKey(): Promise<string> {

        const cookie = await this.getBiliAntiCookie()
        const req = await proxyFetch(this.BILI_WEB_NAV, {
            headers: { 'User-Agent': this.BROWSER_UA, 'Referer': this.BILI_REFERER, 'Cookie': cookie }
        });
        const res = await req.json<BiliTypes.BAPI.BiliNav>()
        const img_url = res.data.wbi_img.img_url
        const sub_url = res.data.wbi_img.sub_url
        if (!img_url || !sub_url) {
            throw new Error("Cannot Get Nav WBI")
        }
        const wbi_1 = img_url.split('/').pop()?.split('.')[0] as string
        const wbi_2 = sub_url.split('/').pop()?.split('.')[0] as string
        const wbi_orig = wbi_1 + wbi_2
        const key = this.BILI_MIXIN_KEY_ENC.map(n => wbi_orig[n]).join('').slice(0, 32)
        return key
    }

    public async signApp(params: Record<any, any>, platform: BiliTypes.PlatformAPPKEY): Promise<URLSearchParams> {

        const appkey = platform.appkey
        const appsec = platform.appsec

        const fullParams: Record<any, any> = { ...params, appkey };

        const uparmas = new URLSearchParams()
        for (const [k, v] of Object.entries(fullParams)) {
            uparmas.append(k, encodeURIComponent(v))
        }

        const qstring = uparmas.toString()
        const sign = md5String(qstring + appsec)
        uparmas.append('sign', sign)

        return uparmas
    }

    public async signWbi(params: Record<any, any>) {

        const mixinKey = await this.getBiliWbiMixinKey();
        const wts = Math.floor(Date.now() / 1000)
        const fullParams: Record<any, any> = { ...params, wts: wts };

        const uparmas = new URLSearchParams()
        for (const [k, v] of Object.entries(fullParams)) {
            uparmas.append(k, encodeURIComponent(v))
        }
        const qstring = uparmas.toString()
        const w_rid = md5String(qstring + mixinKey)
        uparmas.append('w_rid', w_rid)
        return uparmas
    }
}