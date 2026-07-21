import type { Context } from "hono";
import { z } from "zod";

export type AppContext = Context<{ Bindings: Env }>;

export const Task = z.object({
    name: z.string().openapi({ example: "lorem" }),
    slug: z.string(),
    description: z.string().optional(),
    completed: z.boolean().default(false),
    due_date: z.iso.date(),
});

export namespace BiliTypes {

    export namespace RES {

        export namespace Video {

            export interface VideoInfo {
                bvid: string,
                cid: number,
                aid: number,
                title: string,
                pic: string
                duration: number,
                info_source: "fallback" | "view"
                owner: {
                    mid: number,
                    name: string,
                    face: string,
                },
                desc: string,
            }

            export interface PlayURL {
                url: string,
                quality: number,
                platform: BVideoPlatform,
                urlExpirationAt: number
            }

            export type Video = VideoInfo & PlayURL
        }

        export namespace User {

            export interface UserArchieves {
                mid: number,
                seasonId: number,
                archieves: {
                    title: string,
                    cover: string,
                    aid: number,
                    bvid: string,
                    duration: number
                }[],
                pages: {
                    total: number,
                    page: number,
                    pageSize: number,
                }
            }
        }

        export namespace Live {
            export interface LiveInfo {
                isLiving: boolean,
                uid: string,
                roomId: number,
                shortId: number,
                attention: number,
                online: number,
                description: string,
                areaId: number,
                areaName: string,
                background: string,
                cover: string,
                keyframe: string,
                title: string,
                liveTime: string
            }

            export interface LiveStreamURL {
                qn: number,
                url: string,
                format?: string,
                codec?: string
            }

            export interface LiveStream {
                urls: LiveStreamURL[],
                platform: BLivePlatform,
            }

            export interface Live extends LiveInfo {
                stream: LiveStream | null
            }
        }

        export namespace Bangumi {
            export interface BangumiInfo {
                title: string,
                cover: string,
                actors: string,
                evaluate: string,
                seasonId: number,
                seasons: {
                    cover: string,
                    seasonId: number,
                    title: string
                }[]
            }

            export interface BangumiEpisode {
                episodes: {
                    aid: number,
                    cid: number,
                    epid: number,
                    link: string,
                    title: string,
                    status: number,
                    cover: string
                }[]
            }

            export interface BangumiPlayURL {
                quality: number,
                duration: number,
                url: string,
                backups: string[],
                urlExpirationAt: number
            }
        }

        export interface BAvid{
            bvid:string,
            avid:number
        }
    }

    export namespace BAPI {

        interface Response<Data = any> {
            code: number,
            message: string,
            data: Data
        }

        interface ResponseResultLike<Result = any> {
            code: number,
            message: string,
            result: Result
        }

        export namespace UGCSeason {
            export interface SeasonsArchives extends Response<{
                aids: number[],
                archives: {
                    aid: number,
                    bvid: string,
                    duration: number,
                    pic: string,
                    title: string
                }[],
                page: {
                    page_num: number,
                    page_size: number,
                    total: number
                }
            }> { }
        }





        export interface FingerSPI extends Response<{
            b_3: string,
            b_4: string
        }> { }

        export interface BiliWebTicket extends Response<{
            ticket: string
        }> { }

        export interface BiliVideoViewInfo extends Response<{
            cid: number,
            aid: number,
            bvid: string,
            pic: string,
            title: string,
            desc: string,
            duration: number,
            owner: {
                mid: number,
                name: string,
                face: string,
            },
        }> { }

        export interface BiliVideoCidInfo extends Response<{
            cid: number,
            page: number,
            from: string,
            part: string,
            duration: number,
            vid: string,
            first_frame: string,
            ctime: number
        }[]> { }

        export interface BiliPlayURL extends Response<{
            format: string,
            accept_quality: number[],
            quality: number,
            durl: {
                url: string,
                length: number,
                size: number,
                backup_url: string | null
            }[]
        }> { }

        export interface BiliNav extends Response<{
            wbi_img: {
                img_url: string,
                sub_url: string
            },
            ip_region: string
        }> { }

        export interface BiliLiveInfo extends Response<{
            live_status: number,
            uid: string,
            room_id: number,
            short_id: number,
            attention: number,
            online: number,
            description: string,
            area_id: number,
            area_name: string,
            background: string,
            user_cover: string,
            keyframe: string,
            title: string,
            live_time: string
        }> { }

        export interface BiliLivePlayURL extends Response<{
            current_quality: number,
            accept_quality: string[],
            current_qn: number,
            durl: { url: string, order: number }[],

        }> { }

        export interface BiliXLivePlayInfo extends Response<{
            playurl_info: {
                playurl: {
                    stream: {
                        protocol_name: string,
                        format: {
                            format_name: string,
                            codec: {
                                codec_name: string,
                                current_qn: number,
                                base_url: string,
                                url_info: {
                                    host: string,
                                    extra: string
                                }[]
                            }[]
                        }[]
                    }[]
                }
            }
        }> { }

        export interface BiliBangumiInfo extends ResponseResultLike<{
            actors: string,
            evaluate: string,
            season_id: number,
            season_title: string,
            cover: string,
            link: string,
            seasons: {
                cover: string,
                season_id: number,
                season_title: string
            }[]
        }> { }

        export interface BiliBangumiEpisode extends ResponseResultLike<{
            main_section: {
                episodes: {
                    id: number,
                    aid: number,
                    cid: number,
                    cover: string,
                    long_title: string,
                    share_url: string,
                    status: number
                }[]
            }
        }> { }

        export interface BiliBangumiPlayURL extends ResponseResultLike<{
            durl: {
                size: number,
                length: number,
                backup_url: string[],
                url: string
            }[],
            quality: number,
            timelength: number
        }> { }

    }

    export interface PlatformAPPKEY {
        appkey: string,
        appsec: string,
        platform: string,
        ua: string
    }

    export type BVideoPlatform = "web" | 'app'
    export type BLivePlatform = 'h5' | 'xlive'

    export interface BiliVideoCDN {
        ali: string;
        aliov: string;
        alib: string;
        alio1: string;
        ali02: string;
        cos: string;
        cosb: string;
        coso1: string;
        cosdisp: string;
        hw: string;
        hwb: string;
        hwo1: string;
        hwdisp: string;
        bd: string;
        m08c: string;
        m08h: string;
        m08ct: string;
        estgcos: string;
        estgoss: string;
        estghw: string;
        upcdnbda2: string;
        rali: string;
        akam: string;
    }
}

export namespace APITypes {
    export interface APICacheWarp<Data> {
        data: Data,
        expiration: number
    }
}