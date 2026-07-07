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

        export interface BiliVideoInfo extends Response<{
            cid: number,
			aid:number,
			bvid:string,
            pic:string,
			title:string,
			desc:string,
			duration:number,
			owner:{
				mid:number,
				name:string,
				face:string,
			},
        }> { }

        export interface BiliPlayURL extends Response<{
            format: string,
            accept_quality: number[],
            quality:number,
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

    export interface BiliPlayResult {
        bvid: string,
        cid: number,
		aid:number,
        title: string,
        pic: string
        url: string,
        duration: number
        quality:number,
        owner:{
			mid:number,
			name:string,
			face:string,
		},
		desc:string,
        platform:GetURLPlatform,
        urlExpirationS:number
    }

    export interface PlatformAPPKEY {
        appkey: string,
        appsec: string,
        platform: string,
        ua: string
    }

    export type GetURLPlatform = "web" | 'app'
}
