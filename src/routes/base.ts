import { AppContext } from "../types";
import APIRoute from "../utils/api-route";

export class BaseRoute extends APIRoute {

    public override async handle(ctx: AppContext) {

        const serverVersion = this.SERVER_VERSION
        const url = new URL(ctx.req.url)
        const hostname = url.hostname
        const protocol = url.protocol
        const port = url.port

        const localNetworks = [new URLPattern('*://127.0.0.1/*'),new URLPattern('*://localhost/*'),new URLPattern("*://192.168.*.*/*")]

        const demoUrl = ['127.0.0.1','localhost'].includes(hostname) ? `${protocol}//${hostname}:${port}` :`${protocol}//${hostname}`

        const videoInfoUrl = `${demoUrl}/video/BV1UT42167xb?type=json`
        const videoPlayUrl = `${demoUrl}/video/BV1UT42167xb`
        const videoCoverUrl = `${demoUrl}/cover/BV1UT42167xb`
        const liveInfoUrl = `${demoUrl}/live/5055636?type=json`
        const liveStreamUrl = `${demoUrl}/live/5055636`
        const bangumiInfoUrl = `${demoUrl}/bangumi/info?epid=ep378374`
        const bangumiEpisodesUrl = `${demoUrl}/bangumi/episodes?ssid=37498`
        const archieveUrl = ` ${demoUrl}/user/archieve/296909317/3091395`

        const publishYear = '2026'
        const license = "MIT"
        const github = "https://github.com/kiyonya/BiliParser-API"

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>BiliParser API</title><style scoped>*{margin:0;padding:0;}body{box-sizing:border-box;padding:2rem;}</style></head><body><h2>BiliParser API</h2><span>server version: ${serverVersion}</span><br /><br /><h3>Introduction</h3><p>A server running on Cloudflare Workers used to parse Bilibili videos, covers, live streams, bangumis, and archives</p><p>It was designed to play videos and live streams in VRChat. It also provides an API interface that lets you call it whenever you need.</p><p><b>Please don't use it for illegal or unauthorized purposes</b></p><br /><p><a href="${github}">Github</a>&nbsp;&nbsp;<a href="/doc">OpenAPI</a></p><br /><br /><h3>Examples</h3><div><b>视频播放</b>&nbsp;<a href="${videoPlayUrl}">${videoPlayUrl}</a></div><div><b>视频信息</b>&nbsp;<a href="${videoInfoUrl}">${videoInfoUrl}</a></div><div><b>视频封面</b>&nbsp;<a href="${videoCoverUrl}">${videoCoverUrl}</a></div><div><b>直播信息</b>&nbsp;<a href="${liveInfoUrl}">${liveInfoUrl}</a></div><div><b>直播推流</b>&nbsp;<a href="${liveStreamUrl}">${liveStreamUrl}</a></div><div><b>番剧信息</b>&nbsp;<a href="${bangumiInfoUrl}">${bangumiInfoUrl}</a></div><div><b>番剧剧集</b>&nbsp;<a href="${bangumiEpisodesUrl}">${bangumiEpisodesUrl}</a></div><div><b>用户合集</b>&nbsp;<a href="${archieveUrl}">${archieveUrl}</a></div><br /><br /><h3>License</h3><p>This project is open-source under the <b>${license}</b> license.</p><p>Program by nekocha (${publishYear})</p></body></html>`

        return ctx.html(html, 200, {
            ...this.headers,
            'Cache-Control': "public,max-age=60",
            'Access-Control-Allow-Origin': "*"
        })
    }
}