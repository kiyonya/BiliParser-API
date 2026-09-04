import type { Context } from "hono";
import CacheableObject from "./utils/cache";
import z from "zod";
export interface AppContext extends Context<{ Bindings: Env }> {
    cache: CacheableObject,
    jsonResp: <Data = any>(message: string, code: number, data: Data, schema?: z.ZodType<Data>) => Response,
};
export interface CacheWarp<Data = any> {
    data: Data,
    expirationAt: number,
    key: string
}
export interface CacheResult<Data = any> {
    data: Data,
    raw: CacheWarp<Data>,
    valid: boolean
}
export namespace BiliTypes {

    export namespace RES {

        export namespace Video {

            export type VideoPlayPlatform = "html5" | "pc" | "app"
            export type VideoPlayFormat = "mp4" | "dash"

            export interface VideoPart {
                page: number,
                firstFrame: string,
                duration: number,
                partTitle: string,
                cid: number,
                ctime: number
            }

            export interface VideoInfo {
                bvid: string,
                cid: number,
                aid: number,
                title: string,
                pic: string
                duration: number,
                info_source: "fallback" | "view"
                infoSource: "fallback" | "view"
                owner: {
                    mid: number,
                    name: string,
                    face: string,
                },
                desc: string,
                parts: VideoPart[]
            }

            export interface VideoDashItem {
                baseUrl: string,
                backupUrl: string[],
                bandwidth: number,
                mime: string,
                width: number,
                height: number,
                frameRate: number,
                codecid: number
                codecs: string
                quality: number
            }

            export interface AudioDashItem {
                quality: number
                baseUrl: string,
                backupUrl: string[],
                bandwidth: number,
                mime: string,
                codecs: string,
                codecid: number
            }

            export interface VideoPlay {
                isDash: boolean
                platform: VideoPlayPlatform,
                urlExpirationAt: number,
                cid: number,
                format: VideoPlayFormat
                duration: number
                realQuality: number
            }

            export interface PlayDash extends VideoPlay {
                isDash: true,
                dash: {
                    minBufferTime: number,
                    video: VideoDashItem[] | null,
                    audio: AudioDashItem[] | null,
                    dobly: AudioDashItem[] | null,
                    flac: AudioDashItem[] | null
                }
            }

            export interface PlayURL extends VideoPlay {
                isDash: false
                url: string,
                backupUrl: string[]
                quality: number,
            }

            export interface Video extends VideoInfo {
                play: PlayURL | PlayDash
            }
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
                uid: number,
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

        export interface BAvid {
            bvid: string,
            avid: number
        }

        export namespace Danmaku {

            export interface XML2JSONLike {
                i: {
                    chatserver: string[],
                    chatid: string[],
                    maxlimit: string[],
                    source: string[],
                    d: {
                        _: string,
                        $: {
                            p: string
                        }
                    }[]
                }
            }

            export interface Danmaku {
                text: string,
                params: {
                    time: number,
                    mode: number,
                    fontSize: number,
                    color: number,
                    colorHex: string,
                    sendTime: number,
                    type: number,
                    userHash: string,
                    dbId: string
                }
            }

            export interface DanmakuJSON {
                chatServer: string,
                chatId: string,
                maxLimit: number,
                source: string,
                danmakus: Danmaku[]
            }
        }

        export namespace Subtitle {

            export interface SubtitleItem {
                lang: string,
                langName: string,
                id: string,
                originalJsonUrl: string,
                originalJsonUrlV2: string
            }

            export interface SubtitleItemWithTransfer extends SubtitleItem {
                srt: string
            }
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
            pages: {
                cid: number,
                page: number,
                part: string,
                duration: number,
                first_frame: string,
                ctime: number
            }[]
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
                backup_url: string[] | null
            }[]
        }> { }

        export interface BiliDashItem {
            id: number;
            baseUrl: string;
            backupUrl: null | string[];
            bandwidth: number;
            mimeType: string;
            codecs: string;
            width: number;
            height: number;
            frameRate: string;
            sar: string;
            startWithSap: number;
            segmentBase: {
                initialization: string;
                indexRange: string;
            };
            codecid: number;
        }

        export interface BiliPlayDash extends Response<{
            quality: number,
            format: string,
            accept_quality: number[],
            dash: {
                duration: number,
                minBufferTime: number,
                video: BiliDashItem[],
                audio: BiliDashItem[] | null,
                dolby: {
                    audio: BiliDashItem[]
                } | null,
                flac: {
                    audio: BiliDashItem
                } | null
            }
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

        export interface BiliPlayerV2 extends Response<{
            aid: number,
            bvid: string,
            cid: number,
            subtitle: {
                subtitles: {
                    id: number;
                    lan: string;
                    lan_doc: string;
                    is_lock: boolean;
                    subtitle_url: string;
                    subtitle_url_v2: string;
                    type: number;
                    id_str: string;
                    ai_type: number;
                    ai_status: number;
                }[]
            }
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
        cosov: string
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