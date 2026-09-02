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

const app = new Hono<{ Bindings: Env }>();
app.get('/opensource', (c) => c.redirect("https://github.com/kiyonya/BiliParser-API"))

app.use("*", async (ctx, next) => {
	const reqUrl = new URL(ctx.req.url)
	const pathname = reqUrl.pathname
	const { success } = await ctx.env.RATE_LIMITER.limit({ key: pathname })
	if (!success) {
		return ctx.text(`429 Too Many Requests`, 429)
	}
	await next()
})

const openapi = fromHono(app, {
	docs_url: "/doc"
});

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