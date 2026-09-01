import { AppContext } from "../types";
import APIRoute from "../utils/api-route";

export class BaseRoute extends APIRoute {

    public override async handle(ctx: AppContext) {

        const serverVersion = this.SERVER_VERSION
        const url = new URL(ctx.req.url)
        const hostname = url.hostname
        const protocol = url.protocol
        const port = url.port
        const demoUrl = ['127.0.0.1', 'localhost'].includes(hostname) ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`
        const cf = ctx.req.raw.cf
        
        const demoBvid = "BV1JTRGBBEy2"

        const demoUrls: Record<string, string> = {
            "video play": `${demoUrl}/video/${demoBvid}`,
            "video part": `${demoUrl}/video/BV1LCzTByEBY/2`,
            "video info": `${demoUrl}/video/${demoBvid}?type=json`,
            "video dash": `${demoUrl}/video/${demoBvid}?format=dash&platform=pc&qn=80`,
            "video cover": `${demoUrl}/cover/${demoBvid}`,
            "video subtitle": `${demoUrl}/subtitle/BV1vnbPz4ECg`,
            "video subtitle part": `${demoUrl}/subtitle/BV1vnbPz4ECg/1`,
            "video subtitle advance": `${demoUrl}/subtitle/BV1vnbPz4ECg?lang=zh-Hans&type=srt`,
            "danmaku xml": ` ${demoUrl}/danmaku/${demoBvid}`,
            "danmaku json": ` ${demoUrl}/danmaku/${demoBvid}?type=json`,
            "live info": `${demoUrl}/live/5055636?type=json`,
            "live stream": `${demoUrl}/live/5055636`,
            "bangumi info": `${demoUrl}/bangumi/info?epid=ep378374`,
            "bangumi episodes": `${demoUrl}/bangumi/episodes?ssid=37498`,
            "user archieve": ` ${demoUrl}/user/archieve/296909317/3091395`,
        }

        const rows = Object.entries(demoUrls)
            .map(([type, url]) => `<tr><td>${type}</td><td><a href="${url}">${url}</a></td></tr>`)
            .join("")

        const publishYear = '2026'
        const license = "MIT"
        const github = "https://github.com/kiyonya/BiliParser-API"

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
        <h2>Cloudflare BiliParser API</h2>
        <span>server version: ${serverVersion}&nbsp;&nbsp;|&nbsp;&nbsp;colo: ${cf?.colo}&nbsp;&nbsp;|&nbsp;&nbsp;tcprtt:${cf?.clientTcpRtt}ms</span>

        <br />
        <br />
        
        <h3>Introduction</h3>
        
        <p>A server running on Cloudflare Workers used to parse Bilibili videos, covers, danmaku list, live streams, bangumis, and archives.</p>
        <p>It was designed to play videos and live streams in VRChat. It also provides an API interface that lets you call it whenever you need.</p>
        <p>The server will determine your approximate country or region to assign the appropriate CDN server. Your information won't be collected and will be deleted after the request is completed.</p>
        <p><b>Please don't use it for illegal or unauthorized purposes</b></p>
        <br />
        <p>
        <a href="${github}">Github</a>
        &nbsp;&nbsp;
        <a href="/doc">OpenAPI</a>
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
        <p>Program by nekocha (${publishYear})</p></body></html>`

        return ctx.html(html, 200, {
            ...this.headers,
            'Cache-Control': "public, max-age=60, must-revalidate",
            'Access-Control-Allow-Origin': "*"
        })
    }
}