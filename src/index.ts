import { fromHono, OpenAPIRoute } from "chanfana";
import { Hono } from "hono";
import { BiliVideoRoute } from "./routes/video";
import { AppContext } from "./types";
import { BiliLiveRoute } from "./routes/live";
import { BiliProxyPlay } from "./routes/uplay";
import { BiliBangumiEpisodesRoute, BiliBangumiInfoRoute, BiliBangumiPlayRoute } from "./routes/bangumi";
import { BiliIpRegionRoute } from "./routes/biliip";
import { BiliArchieveRoute } from "./routes/archieve";
import { BiliVideoCDNRoute } from "./routes/cdn";
import APIRoute from "./utils/api-route";
import { BARoute } from "./routes/b2a";


const app = new Hono<{ Bindings: Env }>();
const openapi = fromHono(app, {
	docs_url: "/doc",
});

class BaseRoute extends APIRoute {
	public override handle(context: AppContext) {
		return context.text(`Cloudflare BiliParser API\nProgram By Nekocha\nVersion:${this.SERVER_VERSION}\ngithub:https://github.com/kiyonya/BiliParser-API\n\n\nだから妄想感傷代償連盟\n愛を懐いて理想を叫んだ\n行き場のない愚者のメロディー\n再挑戦•転生•テレポーテーション\n何回だって　重ねて逝くんだ`, 200)
	}
}

openapi.all('/', BaseRoute)
openapi.get('/video/:bvid?', BiliVideoRoute)
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