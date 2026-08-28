import z from "zod";
import { BiliTypes } from "./types";

export abstract class Validation {

    public static videoPartSchema: z.ZodType<BiliTypes.RES.Video.VideoPart> = z.object({
        page: z.coerce.number(),
        firstFrame: z.union([z.url(), z.string()]).default(""),
        duration: z.coerce.number(),
        partTitle: z.string(),
        ctime: z.number(),
        cid: z.number()
    })

    public static videoInfoSchema: z.ZodType<BiliTypes.RES.Video.VideoInfo> = z.object({
        bvid: z.string(),
        cid: z.number(),
        aid: z.number(),
        title: z.string(),
        pic: z.union([z.url(), z.string()]).default(""),
        duration: z.number().nonnegative(),
        info_source: z.enum(["fallback", "view"]),
        infoSource: z.enum(["fallback", "view"]),
        owner: z.object({
            mid: z.number().int().nonnegative(),
            name: z.string(),
            face: z.string(),
        }),
        desc: z.string(),
        parts: z.array(this.videoPartSchema)
    });

    public static videoPlayUrlSchema: z.ZodType<BiliTypes.RES.Video.PlayURL> = z.object({
        url: z.url(),
        originalCdnHostname: z.string(),
        quality: z.number().int().nonnegative(),
        platform: z.enum(["web", "app"]),
        urlExpirationAt: z.number().int().positive(),
    });

    public static liveStreamSchema: z.ZodType<BiliTypes.RES.Live.LiveStream> = z.object({
        urls: z.array(z.object({
            qn: z.number().nonnegative(),
            url: z.url(),
            format: z.string().optional(),
            codec: z.string().optional()
        })),
        platform: z.enum(['xlive', 'h5'])
    })

    public static liveSchema: z.ZodType<BiliTypes.RES.Live.Live> = z.object({
        isLiving: z.boolean(),
        uid: z.number(),
        roomId: z.number().int().positive(),
        shortId: z.number().int().nonnegative(),
        attention: z.number().int().nonnegative(),
        online: z.number().int().nonnegative(),
        description: z.string(),
        areaId: z.number().int().positive(),
        areaName: z.string(),
        background: z.string(),
        cover: z.string(),
        keyframe: z.string(),
        title: z.string(),
        liveTime: z.string(),
        stream: z.union([
            Validation.liveStreamSchema, z.null()
        ])
    });

    public static bangumiInfoSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiInfo> = z.object({
        title: z.string(),
        cover: z.string(),
        actors: z.string(),
        evaluate: z.string(),
        seasonId: z.number().int().positive(),
        seasons: z.array(z.object({
            cover: z.string(),
            seasonId: z.number().int().positive(),
            title: z.string(),
        })),
    });

    public static bangumiEpisodeSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiEpisode> = z.object({
        episodes: z.array(z.object({
            aid: z.number(),
            cid: z.number(),
            epid: z.number(),
            link: z.url(),
            title: z.string(),
            status: z.number(),
            cover: z.url()
        }))
    })

    public static bangumiPlayUrlSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiPlayURL> = z.object({
        quality: z.number(),
        duration: z.number().nonnegative(),
        url: z.url(),
        backups: z.array(z.string()),
        urlExpirationAt: z.number()
    })

    public static userArchievesSchema: z.ZodType<BiliTypes.RES.User.UserArchieves> = z.object({
        mid: z.number().int().positive(),
        seasonId: z.number().int().positive(),
        archieves: z.array(z.object({
            title: z.string(),
            cover: z.url(),
            aid: z.number().int().positive(),
            bvid: z.string(),
            duration: z.number().int().nonnegative(),
        })),
        pages: z.object({
            total: z.number().int().nonnegative(),
            page: z.number().int().positive(),
            pageSize: z.number().int().positive(),
        }),
    });

    public static videoSubtitleItemSchema: z.ZodType<BiliTypes.RES.Subtitle.SubtitleItem> = z.object({
        lang: z.string(),
        langName: z.string(),
        originalJsonUrl: z.string(),
        originalJsonUrlV2: z.string(),
        id: z.string()
    })

    public static videoSubtitleItemWithTransferSchema: z.ZodType<BiliTypes.RES.Subtitle.SubtitleItemWithTransfer> = z.object({
        lang: z.string(),
        langName: z.string(),
        originalJsonUrl: z.string(),
        originalJsonUrlV2: z.string(),
        id: z.string(),
        srt: z.url()
    })

    public static danmakuSchema: z.ZodType<string> = z.string()

    public static danmakuJSONSchema: z.ZodType<BiliTypes.RES.Danmaku.DanmakuJSON> = z.object({
        chatServer: z.string(),
        chatId: z.string(),
        maxLimit: z.number(),
        source: z.string(),
        danmakus: z.array(z.object({
            text: z.string(),
            params: z.object({
                time: z.number(),
                mode: z.number(),
                fontSize: z.number(),
                color: z.number(),
                colorHex: z.string(),
                sendTime: z.number(),
                type: z.number(),
                userHash: z.string(),
                dbId: z.string()
            })
        }))
    })

    public static videoSchema: z.ZodType<BiliTypes.RES.Video.Video> = z.intersection(
        Validation.videoInfoSchema,
        z.intersection(
            Validation.videoPlayUrlSchema,
            z.object({
                urlVideoPart: z.number().int().positive(),
                urlCid: z.number().int().positive()
            })
        )
    )

    public static bAvidSchema: z.ZodType<BiliTypes.RES.BAvid> = z.object({
        bvid: z.string(),
        avid: z.number().int().nonnegative()
    })

    public static ipRegionSchema: z.ZodType<{ ipRegion: string }> = z.object({
        ipRegion: z.string()
    })

    public static videoCDNSchema: z.ZodType<BiliTypes.BiliVideoCDN> = z.record(z.string(), z.string()) as unknown as z.ZodType<BiliTypes.BiliVideoCDN>

}