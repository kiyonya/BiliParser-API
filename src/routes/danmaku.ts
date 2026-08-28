import z from "zod";
import { AppContext, BiliTypes } from "../types";
import APIRoute from "../utils/api-route";
import BiliVideoParser from "../services/video-parser";
import { Validation } from "../validation";
import { Config } from "../config";
import xml2js from 'xml2js'

export class BiliDanmakuRoute extends APIRoute {

    private readonly PARAMS = z.object({
        bvid: z.string().optional(),
        type: z.enum(['xml', 'json']).optional().default('xml'),
        url: z.url().optional(),
        p: z.coerce.number().nonnegative().int().optional().default(1).transform(p => p === 0 ? 1 : p)
    }).transform(async (args) => {
        let { bvid, p, url } = args
        if (url) {
            const processed = await this.getBvParamsFromUrl(url)
            if (!processed) {
                throw new Error("cannot get bvid from url")
            }
            bvid = processed.bvid
            p = processed.p
        }
        return { ...args, bvid, p }
    }).superRefine((args, ctx) => {
        if (!args.bvid) {
            ctx.addIssue("cannot find bvid to parse")
        }
    })

    private _parser: BiliVideoParser | null = null
    protected get parser() {
        if (!this._parser) {
            this._parser = new BiliVideoParser()
        }
        return this._parser
    }

    private async getDanmakuXML(ctx: AppContext, bvid: string, p: number = 1): Promise<string | null> {
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.videoInfoSchema)
        if (!videoInfo) {
            videoInfo = await this.parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BiliVideoInfoCacheTime, Validation.videoInfoSchema)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }
        const cid = targetPart.cid
        this.resHeaders.set("x-url-cid", String(cid))
        this.resHeaders.set("x-url-vpart", String(p))

        const key = this.CacheKey.danmaku(cid)
        let danmakuXML = await this.getCache<string>(ctx, key, Validation.danmakuSchema)
        if (!danmakuXML) {
            danmakuXML = await this.parser.getVideoDanmakuXML(cid)
            if (danmakuXML) {
                await this.setCache<string>(ctx, key, danmakuXML, this.nowS + Config.BiliDanmakuCacheTime, Validation.danmakuSchema)
            }
        }
        return danmakuXML
    }

    private async parseXML2JSON(danmakuXML: string): Promise<BiliTypes.RES.Danmaku.DanmakuJSON> {
        const json = await new Promise<BiliTypes.RES.Danmaku.XML2JSONLike>((resolve, reject) => {
            xml2js.parseString(danmakuXML, (error, result) => {
                if (!error) {
                    resolve(result)
                }
                else {
                    reject(error)
                }
            })
        })

        const color2Hex = (color: number | undefined) => {
            color = color || 16777215
            return color.toString(16).padStart(6, '0');
        }

        const danmakus: BiliTypes.RES.Danmaku.Danmaku[] = []
        for (const d of json.i.d) {
            const p = d.$.p
            const ps = p.split(",").map(i => i.trim())
            const text = d._
            danmakus.push({
                text: text,
                params: {
                    time: Number(ps[0]),
                    mode: Number(ps[1]),
                    fontSize: Number(ps[2]),
                    color: Number(ps[3]),
                    colorHex: color2Hex(Number(ps[3])),
                    sendTime: Number(ps[4]),
                    type: Number(ps[5]),
                    userHash: String(ps[6]),
                    dbId: String(ps[7])
                }
            })
        }
        return {
            chatServer: json.i.chatserver[0] || "",
            chatId: json.i.chatid[0] || "",
            maxLimit: Number(json.i.maxlimit[0]),
            source: json.i.source[0] || "",
            danmakus: danmakus.sort((a, b) => a.params.time - b.params.time)
        }
    }

    public override async handle(ctx: AppContext) {
        try {
            const url = new URL(ctx.req.url)
            const pathname = url.pathname
            const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
            if (!success) {
                return ctx.text(`429 Too Many Requests`, 429)
            }

            const params = await this.PARAMS.safeParseAsync({
                bvid: ctx.req.param('bvid') || url.searchParams.get('bvid') || undefined,
                type: url.searchParams.get('type') || undefined,
                url: url.searchParams.get('url') || undefined,
                p: ctx.req.param("p") || url.searchParams.get('p') || undefined
            })

            if (!params.success) {
                return this.jsonResponse(ctx, params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, p: page } = params.data
            const bvid = params.data.bvid!
            const danmakuXML = await this.getDanmakuXML(ctx, bvid, page)
            if (!danmakuXML) {
                throw new Error('failed to parse danmaku via cid')
            }

            switch (type) {
                case "json":
                    const xmlJson = await this.parseXML2JSON(danmakuXML)
                    return this.jsonResponse(ctx, 'Success', 200, xmlJson, Validation.danmakuJSONSchema)
                case "xml":
                default:
                    const xmlResponse = new Response(danmakuXML, {
                        headers: new Headers({
                            ...this.headers,
                            'Content-Type': "application/xml"
                        })
                    })
                    return xmlResponse
            }
        } catch (error) {
            return this.jsonResponse(ctx, (error as Error)?.message, 500, null)
        }
    }
}