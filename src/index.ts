import { fromHono, OpenAPIRoute } from "chanfana";
import { Hono } from "hono";
import { BiliVideoCDNRoute, BiliVideoRoute } from "./routes/video";
import { AppContext } from "./types";

const app = new Hono<{ Bindings: Env }>();
const openapi = fromHono(app, {
	docs_url: "/doc",
});

class BaseRoute extends OpenAPIRoute {
	public override handle(context:AppContext) {
		return context.text("Nya~~",200)
	}
}

openapi.all('/',BaseRoute)
openapi.get('/video/:bvid?', BiliVideoRoute)
openapi.get('/video-cdn', BiliVideoCDNRoute)
//alias
// openapi.get('/bili/v1/video/:bvid?',BiliVideoRoute)
// openapi.get('/bili/v1/video-cdn',BiliVideoCDNRoute)
export default app;
