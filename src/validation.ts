import z from "zod";
import { BiliTypes } from "./types";

export abstract class Validation {

    protected static videoPartSchema:z.ZodType<BiliTypes.RES.Video.VideoPart> = z.object({
        page:z.coerce.number(),
        firstFrame:z.union([z.url(),z.string()]).default(""),
        duration:z.coerce.number(),
        partTitle:z.string(),
        ctime:z.number(),
        cid:z.number()
    })

    protected static videoInfoSchema: z.ZodType<BiliTypes.RES.Video.VideoInfo> = z.object({
        bvid: z.string(),
        cid: z.number(),
        aid: z.number(),
        title: z.string(),
        pic: z.union([z.url(),z.string()]).default(""),
        duration: z.number().nonnegative(),
        info_source: z.enum(["fallback", "view"]),
        infoSource: z.enum(["fallback", "view"]),
        owner: z.object({
            mid: z.number().int().nonnegative(),
            name: z.string(),
            face: z.string(),
        }),
        desc: z.string(),
        parts:z.array(this.videoPartSchema)
    });

    protected static videoPlayUrlSchema: z.ZodType<BiliTypes.RES.Video.PlayURL> = z.object({
        url: z.url(),
        originalCdnHostname: z.string(),
        quality: z.number().int().nonnegative(),
        platform: z.enum(["web", "app"]),
        urlExpirationAt: z.number().int().positive(),
    });

    protected static liveStreamSchema: z.ZodType<BiliTypes.RES.Live.LiveStream> = z.object({
        urls: z.array(z.object({
            qn: z.number().nonnegative(),
            url: z.url(),
            format: z.string().optional(),
            codec: z.string().optional()
        })),
        platform: z.enum(['xlive', 'h5'])
    })

    protected static liveSchema: z.ZodType<BiliTypes.RES.Live.Live> = z.object({
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
        cover:z.string(),
        keyframe: z.string(),
        title: z.string(),
        liveTime: z.string(),
        stream: z.union([
            Validation.liveStreamSchema, z.null()
        ])
    });

    protected static bangumiInfoSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiInfo> = z.object({
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

    protected static bangumiEpisodeSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiEpisode> = z.object({
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

    protected static bangumiPlayUrlSchema: z.ZodType<BiliTypes.RES.Bangumi.BangumiPlayURL> = z.object({
        quality: z.number(),
        duration: z.number().nonnegative(),
        url: z.url(),
        backups: z.array(z.string()),
        urlExpirationAt: z.number()
    })

    protected static userArchievesSchema: z.ZodType<BiliTypes.RES.User.UserArchieves> = z.object({
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

    public static validVideoInfo(data: BiliTypes.RES.Video.VideoInfo) {
        return Validation.videoInfoSchema.safeParse(data).success;
    }
    public static validPlayUrl(data: BiliTypes.RES.Video.PlayURL) {
        return Validation.videoPlayUrlSchema.safeParse(data).success
    }
    public static validLiveStream(data: BiliTypes.RES.Live.LiveStream) {
        return Validation.liveStreamSchema.safeParse(data).success
    }
    public static validLive(data: BiliTypes.RES.Live.Live) {
        return Validation.liveSchema.safeParse(data).success
    }
    public static validBangumiInfo(data: BiliTypes.RES.Bangumi.BangumiInfo) {
        return Validation.bangumiInfoSchema.safeParse(data).success
    }
    public static validBangumiEpisode(data: BiliTypes.RES.Bangumi.BangumiEpisode) {
        return Validation.bangumiEpisodeSchema.safeParse(data).success
    }
    public static validBangumiPlayUrl(data: BiliTypes.RES.Bangumi.BangumiPlayURL) {
        return Validation.bangumiPlayUrlSchema.safeParse(data).success
    }
    public static validUserArchieves(data: BiliTypes.RES.User.UserArchieves) {
        return Validation.userArchievesSchema.safeParse(data).success
    }
    public static validDanmaku(data:string){
        return z.string().safeParse(data).success
    }

}