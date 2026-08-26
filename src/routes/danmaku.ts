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
        cid: z.coerce.number().optional(),
        type: z.enum(['xml', 'json']).optional().default('xml'),
        url: z.url("*.bilibili.com/video/*").optional(),
    })

    private _parser: BiliVideoParser | null = null
    protected get parser() {
        if (!this._parser) {
            this._parser = new BiliVideoParser()
        }
        return this._parser
    }

    private async getVideoInfo(ctx: AppContext, bvid: string): Promise<BiliTypes.RES.Video.VideoInfo> {
        const infoKey = this.CacheKey.videoInfo(bvid)
        let videoInfo = await this.getCache(ctx, infoKey, Validation.validVideoInfo)
        if (!videoInfo) {
            videoInfo = await this.parser.getVideoInfo(bvid)
            await this.setCache(ctx, infoKey, videoInfo, this.nowS + Config.BiliVideoInfoCacheTime, Validation.validVideoInfo)
        }
        return videoInfo
    }

    private async getDanmakuXML(ctx: AppContext, cid: number): Promise<string | null> {
        const key = this.CacheKey.danmaku(cid)
        let danmakuXML = await this.getCache<string>(ctx, key, Validation.validDanmaku)
        if (!danmakuXML) {
            danmakuXML = await this.parser.getVideoDanmakuXML(cid)
            if (danmakuXML) {
                await this.setCache<string>(ctx, key, danmakuXML, this.nowS + Config.BiliDanmakuCacheTime, Validation.validDanmaku)
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
            danmakus: danmakus.sort((a,b)=>a.params.time - b.params.time)
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

            const params = this.PARAMS.safeParse({
                bvid: ctx.req.param('bvid') || url.searchParams.get('bvid') || undefined,
                cid: url.searchParams.get('cid') || undefined,
                type: url.searchParams.get('type') || undefined,
                url: url.searchParams.get('url') || undefined
            })

            if (!params.success) {
                return this.jsonResponse(ctx, "invalid params", 400, null)
            }
            let { type, bvid, cid, url: provideUrl } = params.data
            if (!cid) {
                if (!bvid && provideUrl) {
                    bvid = await this.getBvParamsFromUrl(provideUrl)
                }
                if (bvid) {
                    const videoInfo = await this.getVideoInfo(ctx, bvid)
                    cid = videoInfo?.cid
                }
                if (!cid) {
                    return this.jsonResponse(ctx, "cannot get cid to parse", 400, null)
                }
            }
            const danmakuXML = await this.getDanmakuXML(ctx, cid)
            if (!danmakuXML) {
                throw new Error('failed to parse danmaku via cid')
            }

            switch (type) {
                case "json":
                    const xmlJson = await this.parseXML2JSON(danmakuXML)
                    return this.jsonResponse(ctx, 'Success', 200, xmlJson)
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