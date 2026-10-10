import { FetchImpl } from "../../general/create"
import { AppContext } from "../../general/types/app"

export function createCfProxyFetch(ctx: AppContext): FetchImpl {
    const config = ctx.config
    if(!config.ENABLE_PROXY_SERVER){
        return fetch
    }
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof Request ? input.url : input.toString()
        const proxyServerUrl = config.PROXY_SERVER_URL
        if (!proxyServerUrl) {
            throw new Error("no proxy server added")
        }
        const token = config.PROXY_SERVER_TOKEN
        const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
        if (token) {
            headers.set(config.PROXY_TOKEN_HEADER, token)
        }
        const proxyUrl = new URL(proxyServerUrl)
        proxyUrl.searchParams.set('url', url)
        const requestInit: RequestInit = input instanceof Request
            ? { method: input.method, headers: headers, body: input.body, signal: input.signal }
            : { ...init, headers: headers }
        return fetch(proxyUrl, requestInit)
    }
}