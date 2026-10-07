import { Config } from "../shared/config";
import { AppContext, BiliTypes } from "../types";
import { hmacSha256, md5String } from "./hashlib";
import { proxyFetch } from "./proxy-fetch";
import SharedData from "../shared/data";

export default class BiliCrypto {

    protected ctx: AppContext
    constructor(ctx: AppContext) {
        this.ctx = ctx
    }

    protected wbiImgUrl: string | null = null
    protected wbiSubUrl: string | null = null

    public biliAntiCookie: string | null = null
    public biliWbiMixinKey: string | null = null

    public async getBiliCookie(): Promise<string> {
        if (!this.biliAntiCookie) {
            this.biliAntiCookie = await this.createBiliCookie()
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

    public async createAnonymousCookie(noCache: boolean = false): Promise<Record<string, string>> {
        const cookiesCacheKey = SharedData.cacheKey.cookie()
        let cookies = noCache ? null : await this.ctx.cache.getCache<Record<string, string>>(cookiesCacheKey, undefined, 'kv', false)
        if (!cookies) {
            const signTs = Math.floor(Date.now() / 1000)
            this.ctx.header('X-Bcrypto-Cookies-Cache', 'MISS')
            this.ctx.header('X-Bcrypto-Sign-Time', String(signTs))
            let buvid3: string | null = null
            let buvid4: string | null = null;
            let ticket: string | null = null
            let biliTicketExpires: number | null = null

            const [spiResult, ticketResult] = await Promise.allSettled([
                (async () => {
                    const res = await proxyFetch(SharedData.BILI_FINGER_SPI);
                    const json = await res.json<BiliTypes.BAPI.FingerSPI>();
                    return json
                })(),
                (async () => {
                    const hexsign = hmacSha256('XgwSnGZ1p', 'ts' + signTs);
                    const webTicketURL = new URL(SharedData.BILI_WEB_TICKET_API)
                    webTicketURL.searchParams.append('key_id', 'ec02')
                    webTicketURL.searchParams.append('hexsign', hexsign)
                    webTicketURL.searchParams.append('context[ts]', String(signTs))
                    webTicketURL.searchParams.append('csrf', '')
                    const res = await proxyFetch(webTicketURL, { method: 'POST', headers: { "User-Agent": SharedData.BROWSER_UA } });
                    const json = await res.json<BiliTypes.BAPI.BiliWebTicket>();
                    return json
                })()
            ])

            let cookieCacheOk = spiResult.status === 'fulfilled' && ticketResult.status === 'fulfilled'

            if (spiResult.status === 'fulfilled') {
                const spi: BiliTypes.BAPI.FingerSPI = spiResult.value
                if (spi.data?.b_3) {
                    buvid3 = spi.data.b_3
                }
                if (spi.data?.b_4) {
                    buvid4 = spi.data.b_4
                }
            }

            if (ticketResult.status === 'fulfilled') {
                const ticketJson: BiliTypes.BAPI.BiliWebTicket = ticketResult.value
                if (ticketJson.data?.ticket) {
                    ticket = ticketJson.data.ticket
                }
                if (ticketJson.data?.created_at && ticketJson.data?.ttl) {
                    biliTicketExpires = ticketJson.data.created_at + ticketJson.data.ttl
                }
                if (ticketJson.data?.nav) {
                    this.wbiImgUrl = ticketJson.data.nav.img
                    this.wbiSubUrl = ticketJson.data.nav.sub
                }
            }

            cookies = {
                "enable_web_push": "DISABLE",
                "b_lsid": this.randomBlsid(signTs),
                "theme_style": "light",
                "_uuid": this.randomUUID(signTs),
                "buvid3": buvid3 || SharedData.BILI_DEFAULT_BUVID3,
                ...(ticket ? { "bili_ticket": ticket } : {}),
                ...(buvid4 ? { "buvid4": buvid4 } : {}),
                ...(biliTicketExpires ? { "bili_ticket_expires": String(biliTicketExpires) } : {}),
                "b_nut": String(signTs),
                "buvid_fp": md5String(crypto.randomUUID()),
                "CURRENT_FNVAL": "2000",
                "lang": "zh-Hans"
            }

            if (cookieCacheOk && !noCache) {
                const expirationAt = signTs + Config.COOKIES_SIGN_CACHE_TIME
                await this.ctx.cache.setCache(cookiesCacheKey, cookies, () => {
                    return expirationAt
                }, undefined, 'kv')
            }
        }
        else {
            this.ctx.header('X-Bcrypto-Cookies-Cache', 'HIT')
        }
        return cookies
    }

    private async createBiliCookie(): Promise<string> {

        let cookies = await this.createAnonymousCookie()
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
        if (!this.wbiImgUrl || !this.wbiSubUrl) {
            const cookie = await this.getBiliCookie()
            const req = await proxyFetch(SharedData.BILI_WEB_NAV, {
                headers: { 'User-Agent': SharedData.BROWSER_UA, 'Referer': SharedData.BILI_REFERER, 'Cookie': cookie }
            });
            const res = await req.json<BiliTypes.BAPI.BiliNav>()
            this.wbiImgUrl = res.data.wbi_img.img_url
            this.wbiSubUrl = res.data.wbi_img.sub_url
        }
        if (!this.wbiImgUrl || !this.wbiSubUrl) {
            throw new Error("Cannot Get Nav WBI")
        }
        const wbi_1 = this.wbiImgUrl.split('/').pop()?.split('.')[0] as string
        const wbi_2 = this.wbiSubUrl.split('/').pop()?.split('.')[0] as string
        const wbi_orig = wbi_1 + wbi_2
        const key = SharedData.BILI_MIXIN_KEY_ENC.map(n => wbi_orig[n]).join('').slice(0, 32)
        return key
    }

    public genQvid() {

        const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz';
        const result: string[] = [];
        for (let i = 0; i < 32; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            result.push(charset[randomIndex] as string);
        }
        return result.join('');
    }

    public async signApp(params: Record<any, any>, platform: BiliTypes.PlatformAPPKEY): Promise<Record<string, string>> {
        const appkey = platform.appkey;
        const appsec = platform.appsec;
        const fullParams: Record<string, string> = { ...params, appkey: String(appkey) };
        const parts = Object.keys(fullParams).map(
            k => `${k}=${encodeURIComponent(String(fullParams[k]))}`
        );
        const queryString = parts.join('&');
        const sign = md5String(queryString + appsec);
        return { ...fullParams, sign };
    }

    public async signWbi(params: Record<string, string>): Promise<Record<string, string>> {
        const mixinKey = await this.getBiliWbiMixinKey();
        const wts = String(Math.floor(Date.now() / 1000));
        const fullParams: Record<string, string> = { ...params, wts };
        const parts = Object.keys(fullParams).map(k => `${k}=${encodeURIComponent(String(fullParams[k]))}`);
        const queryString = parts.join('&');
        const w_rid = md5String(queryString + mixinKey);
        return { ...fullParams, w_rid, qv_id: this.genQvid() };
    }
}