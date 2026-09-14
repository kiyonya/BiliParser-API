import z from "zod";
import { BiliTypes } from "./types";
import { MemoObject } from "./memo";

export abstract class Validation extends MemoObject {

    public static get videoPartSchema(): z.ZodType<BiliTypes.RES.Video.VideoPart> {
        return this.memo("videoPartSchema", () => z.object({
            page: z.coerce.number(),
            firstFrame: z.union([z.url(), z.string()]).default(""),
            duration: z.coerce.number(),
            partTitle: z.string(),
            ctime: z.number(),
            cid: z.number()
        }))
    }

    public static get videoInfoSchema(): z.ZodType<BiliTypes.RES.Video.VideoInfo> {
        return this.memo("videoInfoSchema", () => z.object({
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
        }))
    }

    public static get videoPlayPlatformSchema(): z.ZodType<BiliTypes.RES.Video.VideoPlayPlatform> {
        return this.memo("videoPlayPlatformSchema", () => z.enum(['html5', 'pc', 'app']))
    }

    public static get videoPlayFormatSchema(): z.ZodType<BiliTypes.RES.Video.VideoPlayFormat> {
        return this.memo("videoPlayFormatSchema", () => z.enum(["mp4", "dash"]))
    }

    public static get videoPlayUrlSchema(): z.ZodType<BiliTypes.RES.Video.PlayURL> {
        return this.memo("videoPlayUrlSchema", () => z.object({
            isDash: z.literal(false),
            format: this.videoPlayFormatSchema,
            cid: z.number(),
            duration: z.number().nonnegative(),
            urlExpirationAt: z.number(),
            platform: this.videoPlayPlatformSchema,
            url: z.url(),
            backupUrl: z.array(z.string()),
            quality: z.number(),
            realQuality: z.number()
        }))
    }

    public static get videoDashItemSchema(): z.ZodType<BiliTypes.RES.Video.VideoDashItem> {
        return this.memo("videoDashItemSchema", () => z.object({
            baseUrl: z.url(),
            backupUrl: z.array(z.string()),
            bandwidth: z.number(),
            mime: z.string(),
            width: z.number(),
            height: z.number(),
            frameRate: z.number(),
            codecid: z.number(),
            codecs: z.string(),
            quality: z.number()
        }))
    }

    public static get audioDashItemSchema(): z.ZodType<BiliTypes.RES.Video.AudioDashItem> {
        return this.memo("audioDashItemSchema", () => z.object({
            quality: z.number(),
            baseUrl: z.url(),
            backupUrl: z.array(z.string()),
            bandwidth: z.number(),
            mime: z.string(),
            codecs: z.string(),
            codecid: z.number()
        }))
    }

    public static get videoPlayDashSchema(): z.ZodType<BiliTypes.RES.Video.PlayDash> {
        return this.memo("videoPlayDashSchema", () => z.object({
            isDash: z.literal(true),
            format: this.videoPlayFormatSchema,
            cid: z.number(),
            duration: z.number().nonnegative(),
            urlExpirationAt: z.number(),
            platform: this.videoPlayPlatformSchema,
            realQuality: z.number(),
            dash: z.object({
                minBufferTime: z.number(),
                video: z.union([z.array(this.videoDashItemSchema), z.null()]),
                audio: z.union([z.array(this.audioDashItemSchema), z.null()]),
                dobly: z.union([z.array(this.audioDashItemSchema), z.null()]),
                flac: z.union([z.array(this.audioDashItemSchema), z.null()])
            })
        }))
    }

    public static get videoPlaySchema(): z.ZodType<BiliTypes.RES.Video.PlayURL | BiliTypes.RES.Video.PlayDash> {
        return this.memo("videoPlaySchema", () => z.union([
            this.videoPlayUrlSchema,
            this.videoPlayDashSchema
        ]))
    }

    public static get videoSchema(): z.ZodType<BiliTypes.RES.Video.Video> {
        return this.memo("videoSchema", () => z.intersection(this.videoInfoSchema, z.object({
            play: this.videoPlaySchema
        })))
    }

    public static get liveStreamSchema(): z.ZodType<BiliTypes.RES.Live.LiveStream> {
        return this.memo("liveStreamSchema", () => z.object({
            urls: z.array(z.object({
                qn: z.number().nonnegative(),
                url: z.url(),
                format: z.string().optional(),
                codec: z.string().optional()
            })),
            platform: z.enum(['xlive', 'h5'])
        }))
    }

    public static get liveSchema(): z.ZodType<BiliTypes.RES.Live.Live> {
        return this.memo("liveSchema", () => z.object({
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
                this.liveStreamSchema, z.null()
            ])
        }))
    }

    public static get bangumiInfoSchema(): z.ZodType<BiliTypes.RES.Bangumi.BangumiInfo> {
        return this.memo("bangumiInfoSchema", () => z.object({
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
        }))
    }

    public static get bangumiEpisodeSchema(): z.ZodType<BiliTypes.RES.Bangumi.BangumiEpisode> {
        return this.memo("bangumiEpisodeSchema", () => z.object({
            episodes: z.array(z.object({
                aid: z.number(),
                cid: z.number(),
                epid: z.number(),
                link: z.url(),
                title: z.string(),
                status: z.number(),
                cover: z.url()
            }))
        }))
    }

    /**
     * @deprecated
     */
    public static get bangumiPlayUrlSchema(): z.ZodType<BiliTypes.RES.Bangumi.BangumiPlayURL> {
        return this.memo("bangumiPlayUrlSchema", () => z.object({
            quality: z.number(),
            duration: z.number().nonnegative(),
            url: z.url(),
            backups: z.array(z.string()),
            urlExpirationAt: z.number()
        }))
    }

    public static get userArchievesSchema(): z.ZodType<BiliTypes.RES.User.UserArchieves> {
        return this.memo("userArchievesSchema", () => z.object({
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
        }))
    }

    public static get userFavSchema(): z.ZodType<BiliTypes.RES.User.UserFav> {
        return this.memo("userFavSchema", () => z.object({
            fid: z.number().int().positive(),
            pic: z.union([z.url(), z.string()]).default(""),
            creator: z.object({
                uid: z.number().int().nonnegative(),
                name: z.string(),
                face: z.union([z.url(), z.string()]).default(""),
            }),
            ctime: z.number().int().nonnegative(),
            mtime: z.number().int().nonnegative(),
            medias: z.array(z.object({
                aid: z.number().int().nonnegative(),
                bvid: z.string(),
                cid: z.number().int().nonnegative(),
                duration: z.number().int().nonnegative(),
                title: z.string(),
                desc: z.string(),
                pic: z.union([z.url(), z.string()]).default(""),
                owner: z.object({
                    uid: z.number().int().nonnegative(),
                    name: z.string(),
                    face: z.union([z.url(), z.string()]).default(""),
                }),
            }))
        }))
    }

    public static get videoSubtitleItemSchema(): z.ZodType<BiliTypes.RES.Subtitle.SubtitleItem> {
        return this.memo("videoSubtitleItemSchema", () => z.object({
            lang: z.string(),
            langName: z.string(),
            originalJsonUrl: z.string(),
            originalJsonUrlV2: z.string(),
            id: z.string()
        }))
    }

    public static get videoSubtitleItemWithTransferSchema(): z.ZodType<BiliTypes.RES.Subtitle.SubtitleItemWithTransfer> {
        return this.memo("videoSubtitleItemWithTransferSchema", () => z.object({
            lang: z.string(),
            langName: z.string(),
            originalJsonUrl: z.string(),
            originalJsonUrlV2: z.string(),
            id: z.string(),
            srt: z.url()
        }))
    }

    public static get danmakuSchema(): z.ZodType<string> {
        return this.memo("danmakuSchema", () => z.string())
    }

    public static get danmakuJSONSchema(): z.ZodType<BiliTypes.RES.Danmaku.DanmakuJSON> {
        return this.memo("danmakuJSONSchema", () => z.object({
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
        }))
    }

    public static get bAvidSchema(): z.ZodType<BiliTypes.RES.BAvid> {
        return this.memo("bAvidSchema", () => z.object({
            bvid: z.string(),
            avid: z.number().int().nonnegative()
        }))
    }

    public static get ipRegionSchema(): z.ZodType<{ ipRegion: string }> {
        return this.memo("ipRegionSchema", () => z.object({
            ipRegion: z.string()
        }))
    }

    public static get videoCDNSchema(): z.ZodType<BiliTypes.BiliVideoCDN> {
        return this.memo("videoCDNSchema", () => z.record(z.string(), z.string()) as unknown as z.ZodType<BiliTypes.BiliVideoCDN>)
    }

    public static get searchVideoItemSchema(): z.ZodType<BiliTypes.RES.Search.SearchVideoItem> {
        return this.memo("searchVideoItemSchema", () => z.object({
            page: z.number(),
            pageSize: z.number(),
            numResults: z.number(),
            numPages: z.number(),
            results: z.array(z.object({
                type: z.literal("video"),
                aid: z.number(),
                bvid: z.string(),
                title: z.string(),
                desc: z.string(),
                pic: z.string(),
                tag: z.string(),
                duration: z.number(),
                owner: z.object({
                    mid: z.number(),
                    name: z.string(),
                    face: z.string()
                })
            }))
        }))
    }

    public static get searchUserItemSchema(): z.ZodType<BiliTypes.RES.Search.SearchUserItem> {
        return this.memo("searchUserItemSchema", () => z.object({
            page: z.number(),
            pageSize: z.number(),
            numResults: z.number(),
            numPages: z.number(),
            results: z.array(z.object({
                type: z.literal("bili_user"),
                uid: z.number(),
                name: z.string(),
                sign: z.string(),
                fans: z.number(),
                videos: z.number(),
                pic: z.string(),
                level: z.number(),
                latestVideos: z.array(z.object({
                    aid: z.number(),
                    bvid: z.string(),
                    title: z.string(),
                    pic: z.string()
                }))
            }))
        }))
    }

    public static get searchLiveItemSchema(): z.ZodType<BiliTypes.RES.Search.SearchLiveItem> {
        return this.memo("searchLiveItemSchema", () => z.object({
            page: z.number(),
            pageSize: z.number(),
            numResults: z.number(),
            numPages: z.number(),
            results: z.array(z.object({
                type: z.literal("live"),
                roomId: z.number(),
                title: z.string(),
                tag: z.string(),
                pic: z.string(),
                liveTime: z.string(),
                online: z.number(),
                attentions: z.number(),
                liveUser: z.object({
                    uid: z.number(),
                    name: z.string(),
                    face: z.string()
                }),
            }))
        }))
    }

    public static get searchResultSchema(): z.ZodType<BiliTypes.RES.Search.SearchVideoItem | BiliTypes.RES.Search.SearchUserItem | BiliTypes.RES.Search.SearchLiveItem> {
        return this.memo("searchResultSchema", () => z.union([
            this.searchVideoItemSchema,
            this.searchUserItemSchema,
            this.searchLiveItemSchema
        ]))
    }

}
