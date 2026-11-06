import { AppContext } from "../types/app";
import { RouteHandler } from "./api";

export class BaseAPI extends RouteHandler {

    public override async doHandle(ctx: AppContext) {

        const serverVersion = ctx.config.SERVER_VERSION || "NA"
        const url = new URL(ctx.req.url)
        const hostname = url.hostname
        const protocol = url.protocol
        const port = url.port
        const demoUrl = ['127.0.0.1', 'localhost'].includes(hostname) ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`

        const demoBvid = "BV1Sg411w7T9"
        const demoAvid = "av248637970"
        const license = "MIT"
        const github = "https://github.com/kiyonya/BiliParser-API"

        const intro = `A lightweight, free server compatible with multiple edge computing platforms, used to parse Bilibili videos, livestreams, covers, danmaku, search keywords, and view user archieves and favorite collections.

Fully compatible with VRChat! you can enter the link into almost any built-in player and play the corresponding video without needing to copy the lengthy parsed video URL. You can also play them in browsers and audio/video players.

The server will assign an appropriate video CDN based on your geographic location to ensure your access speed. This data will not be collected.

Please do not use it for illegal purposes, and do not use crawlers to scrape information in bulk.`

        const demoUrls: Record<string, string> = {
            "video play": `${demoUrl}/video/${demoBvid}`,
            "video play alias": `${demoUrl}/v/${demoBvid}`,
            "video play by url": `${demoUrl}/video?url=https://www.bilibili.com/video/BV18F8UzkEwg`,
            "video part": `${demoUrl}/video/BV1LCzTByEBY/2`,
            "video info": `${demoUrl}/video/${demoBvid}?type=info`,
            "video url": `${demoUrl}/video/${demoBvid}?type=url`,
            "video full info": `${demoUrl}/video/${demoBvid}?type=full`,
            "video dash": `${demoUrl}/video/${demoBvid}?format=dash&platform=pc&qn=80`,
            "video play av": `${demoUrl}/video/${demoAvid}`,
            "video info av": `${demoUrl}/video/${demoAvid}?type=info`,
            "video url av": `${demoUrl}/video/${demoAvid}?type=url`,
            "video full info av": `${demoUrl}/video/${demoAvid}?type=full`,
            "video cover": `${demoUrl}/cover/${demoBvid}`,
            "video subtitle": `${demoUrl}/subtitle/BV1vnbPz4ECg`,
            "video subtitle part": `${demoUrl}/subtitle/BV1vnbPz4ECg/1`,
            "video subtitle advance": `${demoUrl}/subtitle/BV1vnbPz4ECg?lang=zh-Hans&type=srt`,
            "video cdn allocations": `${demoUrl}/cdn`,
            "live": `${demoUrl}/live/5055636`,
            "live alias": `${demoUrl}/l/5055636`,
            "live info": `${demoUrl}/live/5055636?type=json`,
            "search video": `${demoUrl}/search/video?keyword=宇多田光`,
            "search uploader": `${demoUrl}/search/up?keyword=宇多田光`,
            "search live": `${demoUrl}/search/live?keyword=VRChat`,
            "danmaku xml": ` ${demoUrl}/danmaku/${demoBvid}`,
            "danmaku json": ` ${demoUrl}/danmaku/${demoBvid}?type=json`,
            "user archieve": ` ${demoUrl}/user/archieve/296909317/3091395`,
            "user favlist": ` ${demoUrl}/user/fav/220737630`,
        }

        const infos: Record<string, string> = {
            "Server Version": serverVersion,
            "Location": ctx.appLocation?.colo as string,
        }
        //@ts-ignore
        const ray = ctx.req.header("cf-ray") || ctx.req.raw?.meta?.ray
        if (ray) {
            infos["Ray"] = ray
        }
        const rows = Object.entries(demoUrls)
            .map(([type, url]) => `<tr><td>${type}</td><td><a href="${url}">${url}</a></td></tr>`)
            .join("")


        const html = `
        <!DOCTYPE html>
        <html lang="en">

        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>BiliParser API</title>
        <style scoped>*{margin:0;padding:0;}body{box-sizing:border-box;padding:2rem;}table{ border-collapse: collapse; margin-top: 0.5rem; }th, td{ border: 1px solid #ccc; padding: 0.4rem 0.8rem; text-align: left; }th{ background: #f5f5f5; }</style>
        </head>
        
        <body>
        <h2>BiliParser API</h2>
        <span>${Object.keys(infos).map(k => `${k}: ${infos[k]}`).join("&nbsp;&nbsp;|&nbsp;&nbsp")}</span>

        <br />
        <br />
        
        <h3>Introduction</h3>
        ${intro.split("\n\n").map(i=>`<p>${i.trim()}</p>`).join(" ")}
        <br />
        <p>
        <a href="${github}">Github</a>
        </p>
        <br />
        <br />
        <h3>Examples</h3>
        <table>
        <thead>
        <tr>
        <th>Type</th>
        <th>URL</th>
        </tr>
        </thead>
        <tbody>${rows}</tbody>
        </table>
        <br />
        <br />
        <h3>License</h3>
        <p>This project is open-source under the <b>${license}</b> license.</p>
        </body></html>`

        return ctx.html(html, 200, {
            'Cache-Control': "public, max-age=60, must-revalidate",
            'Access-Control-Allow-Origin': "*"
        })
    }
}