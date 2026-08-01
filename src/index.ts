import { fromHono } from "chanfana";
import { Hono } from "hono";
import { BiliVideoRoute } from "./routes/video";
import { BiliLiveRoute } from "./routes/live";
import { BiliProxyPlay } from "./routes/uplay";
import { BiliBangumiEpisodesRoute, BiliBangumiInfoRoute, BiliBangumiPlayRoute } from "./routes/bangumi";
import { BiliIpRegionRoute } from "./routes/biliip";
import { BiliArchieveRoute } from "./routes/archieve";
import { BiliVideoCDNRoute } from "./routes/cdn";
import { BARoute } from "./routes/b2a";
import { BiliCoverRoute } from "./routes/cover";
import { BaseRoute } from "./routes/base";

const app = new Hono<{ Bindings: Env }>();
const openapi = fromHono(app, {
	docs_url: "/doc"
});

openapi.all('/', BaseRoute)
openapi.get('/video/:bvid?', BiliVideoRoute)
openapi.get('/cover/:bvid?',BiliCoverRoute)
openapi.get('/video-cdn', BiliVideoCDNRoute)
openapi.get('/live/:roomId?', BiliLiveRoute)
openapi.get('/pplay', BiliProxyPlay)
openapi.get('/bangumi/info', BiliBangumiInfoRoute)
openapi.get('/bangumi/episodes', BiliBangumiEpisodesRoute)
openapi.get('/bangumi/play/:epid?', BiliBangumiPlayRoute)
openapi.get('/ipregion', BiliIpRegionRoute)
openapi.get('/user/archieve/:mid?/:sid?', BiliArchieveRoute)
openapi.get('/bvav', BARoute)

export default app