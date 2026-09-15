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
            const processed = await this.utils.getUrlBv(url)
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

    private async getDanmakuXML(ctx: AppContext, bvid: string, p: number = 1): Promise<string | null> {
        const parser = new BiliVideoParser(ctx)
        const infoKey = this.CacheKey.videoInfo(bvid)

        //Validation.videoInfoSchema
        let videoInfo = await this.getSchemaValidData(await ctx.cache?.getCache<BiliTypes.RES.Video.VideoInfo>(infoKey), Validation.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(bvid), Validation.videoInfoSchema, true)
            await ctx.cache?.setCache(infoKey, videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME)
        }
        if (p > videoInfo.parts.length) {
            throw new Error(`video part is out of bounds,max ${videoInfo.parts.length},given ${p}.make sure you provide part in range`)
        }
        const targetPart = videoInfo.parts.filter((w) => w.page === p)[0]
        if (!targetPart) {
            throw new Error(`cannot get target video part with part ${p}`)
        }
        const cid = targetPart.cid
        ctx?.header("x-url-cid", String(cid))
        ctx?.header("x-url-vpart", String(p))

        const key = this.CacheKey.danmaku(cid)

        let danmakuXML = await this.getSchemaValidData(await ctx.cache?.getCache<string>(key), Validation.danmakuSchema)
        if (!danmakuXML) {
            danmakuXML = await this.getSchemaValidData(await parser.getVideoDanmakuXML(cid), Validation.danmakuSchema, true)
            if (danmakuXML) {
                await ctx.cache?.setCache<string>(key, danmakuXML, this.nowS + Config.BILI_DANMAKU_CACHE_TIME)
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
            const params = await this.PARAMS.safeParseAsync({
                bvid: ctx.req.param('bvid') || url.searchParams.get('bvid') || undefined,
                type: url.searchParams.get('type') || undefined,
                url: url.searchParams.get('url') || undefined,
                p: ctx.req.param("p") || url.searchParams.get('p') || undefined
            })

            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, p: page } = params.data
            const bvid = params.data.bvid!

            switch (type) {
                case "json": {
                    //序列化结果缓存
                    const jsonKey = this.CacheKey.danmakuJSON(bvid, page)
                    let xmlJson = await this.getSchemaValidData(await ctx.cache?.getCache<BiliTypes.RES.Danmaku.DanmakuJSON>(jsonKey), Validation.danmakuJSONSchema)
                    if (!xmlJson) {
                        const danmakuXML = await this.getDanmakuXML(ctx, bvid, page)
                        if (!danmakuXML) {
                            throw new Error('failed to parse danmaku via cid')
                        }
                        xmlJson = await this.getSchemaValidData(await this.parseXML2JSON(danmakuXML), Validation.danmakuJSONSchema, true)
                        await ctx.cache?.setCache(jsonKey, xmlJson, this.nowS + Config.BILI_DANMAKU_CACHE_TIME)
                    }
                    return ctx.jsonResp('Success', 200, xmlJson)
                }
                case "xml":
                default: {
                    const danmakuXML = await this.getDanmakuXML(ctx, bvid, page)
                    if (!danmakuXML) {
                        throw new Error('failed to parse danmaku via cid')
                    }
                    return ctx.body(danmakuXML, 200, {
                        'Content-Type': "application/xml"
                    })
                }
            }
        } catch (error) {
            return ctx.jsonResp((error as Error)?.message, 500, null)
        }
    }
}