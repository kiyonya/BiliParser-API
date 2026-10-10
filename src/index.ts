import { createServer } from "../general";
import { createEsaServer } from "./esa";

const app = createServer(createEsaServer())
export default {
    fetch(request: Request, ctx?: any, env?: any) {
        return app.fetch(request, env ?? {}, ctx ?? {})
    }
}