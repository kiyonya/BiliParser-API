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
    export namespace API {

        interface Response<Data = any> {
            code: number,
            message: string,
            data: Data
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
            }
        }> { }
    }

    export interface BiliVideoInfo {
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

    export interface BiliPlayURL {
        url: string,
        quality: number,
        platform: GetURLPlatform,
        urlExpirationAt: number
    }

    export type BiliParseResult = BiliVideoInfo & BiliPlayURL

    export interface BiliPlayResult extends BiliVideoInfo {
        url: string,
        quality: number,
        platform: GetURLPlatform,
        urlExpirationS: number
    }

    export interface PlatformAPPKEY {
        appkey: string,
        appsec: string,
        platform: string,
        ua: string
    }

    export type GetURLPlatform = "web" | 'app'
}

export namespace APITypes {
    export interface APICacheWarp<Data> {
        data: Data,
        expiration: number
    }
}