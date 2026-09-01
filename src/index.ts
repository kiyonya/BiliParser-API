import { fromHono } from "chanfana";
import { Hono } from "hono";
import { BiliVideoRoute } from "./routes/video";
import { BiliLiveRoute } from "./routes/live";
import { BiliProxyPlay } from "./routes/uplay";
import { BiliBangumiEpisodesRoute, BiliBangumiInfoRoute, BiliBangumiPlayRoute } from "./routes/bangumi";
import { BiliIpRegionRoute } from "./routes/biliip";
import { BiliArchieveRoute } from "./routes/archieve";
import { BiliVideoCDNRoute } from "./routes/cdn";
import { BiliCoverRoute } from "./routes/cover";
import { BaseRoute } from "./routes/base";
import { BiliDanmakuRoute } from "./routes/danmaku";
import { SubtitleRoute } from "./routes/subtitle";
import z from "zod";
import { proxyFetch } from "./utils/proxy-fetch";

const app = new Hono<{ Bindings: Env }>();
app.get('/opensource', (c) => c.redirect("https://github.com/kiyonya/BiliParser-API"))
const openapi = fromHono(app, {
	docs_url: "/doc"
});

app.get("/p", async () => {
	const req  = await proxyFetch("https://api.bilibili.com/x/player/playurl?bvid=BV17xM26nEks&cid=40628782078&qn=64&otype=json&platform=html5&high_quality=1&try_look=1&fnval=1&fourk=1&fnver=0",{
		headers:new Headers({
			cookie:"SESSDATA=4c319bad%2C1795337295%2Cbc837%2A52CjD4zoX_Px0xhVIJgvQXvU99jePHSXWuON4OO9hr2jLTc9n3yhZAT5UjDN1iCVYXvAwSVlNMSXF2aUp5QXdzcDBTd2lvWVdTbVVMYV9DUXE5UHBwQjJuRWVtbXE5U1poMnlvTjVEVTR5WGNsazhfV3VEWnhhMmpEZWJ5TVE5cE16MDNZTHhCSVRRIIEC; blackside_state=0; CURRENT_BLACKGAP=0; lang=zh-Hans; CURRENT_QUALITY=116; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODgyNzYwMDEsImlhdCI6MTc4ODAxNjc0MSwicGx0IjotMX0._BVDpy1VPZmWNEFjrRefhiy0JHKpNSBkhpP-jo_e9gM; bili_ticket_expires=1788275941; PVID=1;  home_feed_column=4; browser_resolution=1273-685; CURRENT_FNVAL=4048; b_lsid=0"
		})
	})
	console.log(await req.text())
})


openapi.all('/', BaseRoute)
openapi.get('/danmaku/:bvid?/:p?', BiliDanmakuRoute)
openapi.get('/video/:bvid?/:p?', BiliVideoRoute)
openapi.get('/subtitle/:bvid?/:p?', SubtitleRoute)
openapi.get('/cover/:bvid?', BiliCoverRoute)
openapi.get('/cdn', BiliVideoCDNRoute)
openapi.get('/live/:roomId?', BiliLiveRoute)
openapi.get('/pplay', BiliProxyPlay)
openapi.get('/bangumi/info', BiliBangumiInfoRoute)
openapi.get('/bangumi/episodes', BiliBangumiEpisodesRoute)
openapi.get('/bangumi/play/:epid?', BiliBangumiPlayRoute)
openapi.get('/ipregion', BiliIpRegionRoute)
openapi.get('/user/archieve/:mid?/:sid?', BiliArchieveRoute)




export default app