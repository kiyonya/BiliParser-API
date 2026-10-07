import z from "zod";
import { AppContext, BiliTypes } from "../types";
import Route from "../utils/api-route";
import BiliVideoParser from "../services/video-parser";
import { Schema } from "../shared/schema";
import xml2js from 'xml2js'
import { Config } from "../shared/config";
import SharedData from "../shared/data";

export class BiliDanmakuRoute extends Route {

    private readonly paramSchema = z.object({
        url: this.utils.zodBiliUrl([SharedData.URLPatterns.BILI_VIDEO, SharedData.URLPatterns.B23_TV], "url must be a bilibili video page or b23.tv short link").optional(),
        id: z.string().optional(),
        type: z.enum(['xml', 'json']).optional().default('xml'),
        p: z.coerce.number().nonnegative().int().optional().default(1).transform(p => p === 0 ? 1 : p)
    }).transform(this.utils.zodBiliVideoIdTransformer).superRefine((args, ctx) => {
        if (!args.videoId) {
            ctx.addIssue("cannot resolve video id: no valid url, bvid or avid was provided, so the video cannot be parsed")
        }
    })

    private async getVideoCid(ctx: AppContext, videoId: BiliTypes.BVideoId, p: number = 1): Promise<number> {
        const parser = new BiliVideoParser(ctx)
        const infoKey = videoId.type === 'bvid' ? SharedData.cacheKey.videoInfoBv(videoId.id) : SharedData.cacheKey.videoInfoAv(videoId.id)
        let videoInfo = await this.getSchemaValidData(await ctx.cache?.getCache<BiliTypes.RES.Video.VideoInfo>(infoKey), Schema.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(videoId), Schema.videoInfoSchema, true)

            const setCacheTasks: Promise<void>[] = []
            if (videoInfo.bvid) {
                setCacheTasks.push(ctx.cache.setCache(SharedData.cacheKey.videoInfoBv(videoInfo.bvid), videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME))
            }
            if (videoInfo.aid) {
                setCacheTasks.push(ctx.cache.setCache(SharedData.cacheKey.videoInfoAv(videoInfo.aid), videoInfo, this.nowS + Config.BILI_VIDEO_INFO_CAHCE_TIME))
            }
            await Promise.allSettled(setCacheTasks)
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
        return cid
    }

    private async getDanmakuXML(ctx: AppContext, cid: number): Promise<string | null> {
        const parser = new BiliVideoParser(ctx)
        const key = SharedData.cacheKey.danmaku(cid)

        let danmakuXML = await this.getSchemaValidData(await ctx.cache?.getCache<string>(key), Schema.danmakuSchema)
        if (!danmakuXML) {
            danmakuXML = await this.getSchemaValidData(await parser.getVideoDanmakuXML(cid), Schema.danmakuSchema, true)
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
            const params = await this.paramSchema.safeParseAsync({
                id: ctx.req.param('id') || url.searchParams.get('bvid') || url.searchParams.get('avid') || undefined,
                type: url.searchParams.get('type') || undefined,
                url: url.searchParams.get('url') || undefined,
                p: ctx.req.param("p") || url.searchParams.get('p') || undefined
            })

            if (!params.success) {
                return ctx.jsonResp(params.error.issues[0]?.message ?? "invalid params", 400, null)
            }
            const { type, p: page } = params.data
            const videoId = params.data.videoId!

            const cid = await this.getVideoCid(ctx, videoId, page)

            switch (type) {
                case "json": {
                    //序列化结果缓存
                    const jsonKey = SharedData.cacheKey.danmakuJSON(cid)
                    let xmlJson = await this.getSchemaValidData(await ctx.cache?.getCache<BiliTypes.RES.Danmaku.DanmakuJSON>(jsonKey), Schema.danmakuJSONSchema)
                    if (!xmlJson) {
                        const danmakuXML = await this.getDanmakuXML(ctx, cid)
                        if (!danmakuXML) {
                            throw new Error('failed to parse danmaku via cid')
                        }
                        xmlJson = await this.getSchemaValidData(await this.parseXML2JSON(danmakuXML), Schema.danmakuJSONSchema, true)
                        await ctx.cache?.setCache(jsonKey, xmlJson, this.nowS + Config.BILI_DANMAKU_CACHE_TIME)
                    }
                    return ctx.jsonResp('Success', 200, xmlJson)
                }
                case "xml":
                default: {
                    const danmakuXML = await this.getDanmakuXML(ctx, cid)
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