import { fromHono } from "chanfana";
import { Hono } from "hono";
import { BiliVideoCDNRoute, BiliVideoRoute } from "./routes/video";

const app = new Hono<{ Bindings: Env }>();
const openapi = fromHono(app, {
	docs_url: "/doc",
});

openapi.get('/video/:bvid?', BiliVideoRoute)
openapi.get('/video-cdn', BiliVideoCDNRoute)

export default app;
