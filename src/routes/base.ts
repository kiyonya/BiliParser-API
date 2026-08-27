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

        const videoInfoUrl = `${demoUrl}/video/BV1UT42167xb?type=json`
        const videoPlayUrl = `${demoUrl}/video/BV1UT42167xb`
        const videoParts = `${demoUrl}/video/BV1LCzTByEBY/2`
        const videoCoverUrl = `${demoUrl}/cover/BV1UT42167xb`
        const danmakuXMLUrl = ` ${demoUrl}/danmaku/BV1UT42167xb`
        const danmakuJSONUrl = ` ${demoUrl}/danmaku/BV1UT42167xb?type=json`
        const liveInfoUrl = `${demoUrl}/live/5055636?type=json`
        const liveStreamUrl = `${demoUrl}/live/5055636`
        const bangumiInfoUrl = `${demoUrl}/bangumi/info?epid=ep378374`
        const bangumiEpisodesUrl = `${demoUrl}/bangumi/episodes?ssid=37498`
        const archieveUrl = ` ${demoUrl}/user/archieve/296909317/3091395`
        

        const publishYear = '2026'
        const license = "MIT"
        const github = "https://github.com/kiyonya/BiliParser-API"

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>BiliParser API</title><style scoped>*{margin:0;padding:0;}body{box-sizing:border-box;padding:2rem;}table{ border-collapse: collapse; margin-top: 0.5rem; }th, td{ border: 1px solid #ccc; padding: 0.4rem 0.8rem; text-align: left; }th{ background: #f5f5f5; }</style></head><body><h2>BiliParser API</h2><span>server version: ${serverVersion}</span><br /><br /><h3>Introduction</h3><p>A server running on Cloudflare Workers used to parse Bilibili videos, covers, danmaku list, live streams, bangumis, and archives.</p><p>It was designed to play videos and live streams in VRChat. It also provides an API interface that lets you call it whenever you need.</p><p>The server will determine your approximate country or region to assign the appropriate CDN server. Your information won't be collected and will be deleted after the request is completed.</p><p><b>Please don't use it for illegal or unauthorized purposes</b></p><br /><p><a href="${github}">Github</a>&nbsp;&nbsp;<a href="/doc">OpenAPI</a></p><br /><br /><h3>Examples</h3><table><thead><tr><th>Type</th><th>URL</th></tr></thead><tbody><tr><td>video play</td><td><a href="${videoPlayUrl}">${videoPlayUrl}</a></td></tr><tr><td>video parts</td><td><a href="${videoParts}">${videoParts}</a></td></tr><tr><td>video info</td><td><a href="${videoInfoUrl}">${videoInfoUrl}</a></td></tr><tr><td>video cover</td><td><a href="${videoCoverUrl}">${videoCoverUrl}</a></td></tr><tr><td>danmaku xml</td><td><a href="${danmakuXMLUrl}">${danmakuXMLUrl}</a></td></tr><tr><td>danmaku json</td><td><a href="${danmakuJSONUrl}">${danmakuJSONUrl}</a></td></tr><tr><td>live info</td><td><a href="${liveInfoUrl}">${liveInfoUrl}</a></td></tr><tr><td>live stream</td><td><a href="${liveStreamUrl}">${liveStreamUrl}</a></td></tr><tr><td>bangumi info</td><td><a href="${bangumiInfoUrl}">${bangumiInfoUrl}</a></td></tr><tr><td>bangumi episodes</td><td><a href="${bangumiEpisodesUrl}">${bangumiEpisodesUrl}</a></td></tr><tr><td>user archieve</td><td><a href="${archieveUrl}">${archieveUrl}</a></td></tr></tbody></table><br /><br /><h3>License</h3><p>This project is open-source under the <b>${license}</b> license.</p><p>Program by nekocha (${publishYear})</p></body></html>`

        return ctx.html(html, 200, {
            ...this.headers,
            'Cache-Control': "public, max-age=60, must-revalidate",
            'Access-Control-Allow-Origin': "*"
        })
    }
}