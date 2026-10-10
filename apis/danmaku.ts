import z from "zod";
import BiliVideoParser from "../services/video-parser";
import { XMLParser } from 'fast-xml-parser'
import SharedData from "../shared/data";
import { API, BadRequestError } from "./api";
import { AppContext } from "../types/app";
import { BiliTypes } from "../types/bili";
import { Schema } from "../shared/schema";

export class DanmakuAPI extends API {

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
        const infoKey = videoId.type === 'bvid' ? ctx.appCacheKey.videoInfoBv(videoId.id) : ctx.appCacheKey.videoInfoAv(videoId.id)
        let videoInfo = await this.getSchemaValidData(await ctx.appCache?.getCache<BiliTypes.RES.Video.VideoInfo>(infoKey), Schema.videoInfoSchema)

        if (!videoInfo) {
            videoInfo = await this.getSchemaValidData(await parser.getVideoInfo(videoId), Schema.videoInfoSchema, true)

            const setCacheTasks: Promise<void>[] = []
            if (videoInfo.bvid) {
                setCacheTasks.push(ctx.appCache.setCache(ctx.appCacheKey.videoInfoBv(videoInfo.bvid), videoInfo, this.nowS + ctx.config.BILI_VIDEO_INFO_CAHCE_TIME))
            }
            if (videoInfo.aid) {
                setCacheTasks.push(ctx.appCache.setCache(ctx.appCacheKey.videoInfoAv(videoInfo.aid), videoInfo, this.nowS + ctx.config.BILI_VIDEO_INFO_CAHCE_TIME))
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
        const key = ctx.appCacheKey.danmaku(cid)

        let danmakuXML = await this.getSchemaValidData(await ctx.appCache?.getCache<string>(key), Schema.danmakuSchema)
        if (!danmakuXML) {
            danmakuXML = await this.getSchemaValidData(await parser.getVideoDanmakuXML(cid), Schema.danmakuSchema, true)
            if (danmakuXML) {
                await ctx.appCache?.setCache<string>(key, danmakuXML, this.nowS + ctx.config.BILI_DANMAKU_CACHE_TIME)
            }
        }
        return danmakuXML
    }

    private async parseXML2JSON(danmakuXML: string): Promise<BiliTypes.RES.Danmaku.DanmakuJSON> {
        const parser = new XMLParser({
            ignoreAttributes: false,
            textNodeName: "#text",
        })
        const root = (parser.parse(danmakuXML)?.i ?? {}) as Record<string, any>
        const rawDanmakus = root.d === undefined ? [] : (Array.isArray(root.d) ? root.d : [root.d])

        const color2Hex = (color: number | undefined) => {
            color = color || 16777215
            return color.toString(16).padStart(6, '0');
        }

        const danmakus: BiliTypes.RES.Danmaku.Danmaku[] = []
        for (const d of rawDanmakus) {
            const p = String(d["@_p"] ?? "")
            const ps = p.split(",").map((i: string) => i.trim())
            const text = d["#text"] ?? ""
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
            chatServer: String(root.chatserver ?? ""),
            chatId: String(root.chatid ?? ""),
            maxLimit: Number(root.maxlimit ?? 0),
            source: String(root.source ?? ""),
            danmakus: danmakus.sort((a, b) => a.params.time - b.params.time)
        }
    }

    public override async handler(ctx: AppContext) {
        const url = new URL(ctx.req.url)
        const params = await this.paramSchema.safeParseAsync({
            id: ctx.req.param('id') || url.searchParams.get('bvid') || url.searchParams.get('avid') || undefined,
            type: url.searchParams.get('type') || undefined,
            url: url.searchParams.get('url') || undefined,
            p: ctx.req.param("p") || url.searchParams.get('p') || undefined
        })

        if (!params.success) {
            throw new BadRequestError(params.error.issues[0]?.message ?? "invalid params")
        }
        const { type, p: page } = params.data
        const videoId = params.data.videoId!

        const cid = await this.getVideoCid(ctx, videoId, page)

        switch (type) {
            case "json": {
                //序列化结果缓存
                const jsonKey = ctx.appCacheKey.danmakuJSON(cid)
                let xmlJson = await this.getSchemaValidData(await ctx.appCache?.getCache<BiliTypes.RES.Danmaku.DanmakuJSON>(jsonKey), Schema.danmakuJSONSchema)
                if (!xmlJson) {
                    const danmakuXML = await this.getDanmakuXML(ctx, cid)
                    if (!danmakuXML) {
                        throw new Error('failed to parse danmaku via cid')
                    }
                    xmlJson = await this.getSchemaValidData(await this.parseXML2JSON(danmakuXML), Schema.danmakuJSONSchema, true)
                    await ctx.appCache?.setCache(jsonKey, xmlJson, this.nowS + ctx.config.BILI_DANMAKU_CACHE_TIME)
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
    }
}