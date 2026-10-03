import { Config } from "../shared/config";

export interface ProxyFetchOptions {
    retries?: number;
        initialDelay?: number;
        maxDelay?: number;
        backoffFactor?: number;
        timeout?: number;
        retryCondition?: (response: Response) => boolean;
}

export async function proxyFetch(request:Request,useProxy?:boolean,options?:ProxyFetchOptions):Promise<Response>
export async function proxyFetch(url: string | URL,init?: RequestInit,useProxy?:boolean,options?:ProxyFetchOptions):Promise<Response>
export async function proxyFetch(
    urlOrRequest: string | URL | Request,
    initOrUseProxy?: RequestInit | boolean,
    useProxyOrOptions: boolean | ProxyFetchOptions = Config.ENABLE_PROXY_SERVER,
    maybeOptions?: ProxyFetchOptions
): Promise<Response> {
    let url: string | URL;
    let init: RequestInit | undefined;
    let useProxy: boolean;
    let options: ProxyFetchOptions | undefined;

    if (urlOrRequest instanceof Request) {
        url = urlOrRequest.url;
        init = {
            method: urlOrRequest.method,
            headers: urlOrRequest.headers,
            signal: urlOrRequest.signal
        };
        if (urlOrRequest.body) { init.body = urlOrRequest.body; }
        useProxy = typeof initOrUseProxy === "boolean" ? initOrUseProxy : Config.ENABLE_PROXY_SERVER;
        options = useProxyOrOptions && typeof useProxyOrOptions === "object"
            ? useProxyOrOptions as ProxyFetchOptions
            : maybeOptions;
    } else {
        url = urlOrRequest;
        init = initOrUseProxy as RequestInit | undefined;
        useProxy = typeof useProxyOrOptions === "boolean" ? useProxyOrOptions : Config.ENABLE_PROXY_SERVER;
        options = maybeOptions;
    }

    const {
        retries = Config.PROXY_SERVER_FETCH_MAX_RETRIES,
        timeout = Config.PROXY_SERVER_TIMEOUT,
        initialDelay = 1000,
        maxDelay = 30000,
        backoffFactor = 2,
        retryCondition = (response: Response) => {
            return response.status >= 500 || response.status === 429;
        }
    } = options || {};

    const makeRequest = async (): Promise<Response | Error> => {
        try {
            const signal = init?.signal ?? AbortSignal.timeout(timeout);
            const response = await (useProxy
                ? (() => {
                    const token = Config.PROXY_SERVER_TOKEN
                    const proxyServerUrl = Config.PROXY_SERVER_URL
                    if (!proxyServerUrl) {
                        throw new Error("no proxy server added")
                    }
                    const proxyUrl = new URL(proxyServerUrl);
                    const headers = new Headers(init?.headers);

                    if (token) {
                        headers.set(Config.PROXY_TOKEN_HEADER, token)
                    }
                    proxyUrl.searchParams.set('url', url.toString());
                    return fetch(proxyUrl, {
                        ...init,
                        headers: headers,
                        signal: signal
                    });
                })()
                : fetch(url, {
                    ...init,
                    signal: signal
                }));
            return response;
        } catch (error) {
            if (error instanceof Error) { return error }
            return new Error(error ? String(error) : 'request failed')
        }
    }

    let lastError: Error | null = null
    let delay = initialDelay;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const result = await makeRequest()
        if (result instanceof Response) {
            const isResponseNeedRetry = retryCondition(result)
            if (!isResponseNeedRetry) {
                return result
            }
            else{
                lastError = new Error(`request failed with code:${result.status}`)
            }
        }
        else {
            lastError = result
        }
        if (attempt === retries) {
            break
        }
        const jitter = Math.random() * 0.3 * delay;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay = Math.min(delay * backoffFactor, maxDelay);
    }

    throw (lastError instanceof Error) ? lastError : new Error("request failed");
}
