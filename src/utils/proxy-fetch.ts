import { Config } from "../config";

export async function proxyFetch(
    url: string | URL,
    init?: RequestInit,
    useProxy: boolean = Config.ENABLE_PROXY_SERVER,
    options?: {
        retries?: number;
        initialDelay?: number;
        maxDelay?: number;
        backoffFactor?: number;
        timeout?: number;
        retryCondition?: (response: Response) => boolean;
    }
) {
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
