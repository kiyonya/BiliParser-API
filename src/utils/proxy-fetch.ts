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
        retryCondition?: (error: any) => boolean;
    }
) {
    const {
        retries = Config.PROXY_SERVER_FETCH_MAX_RETRIES,
        timeout = Config.PROXY_SERVER_TIMEOUT,
        initialDelay = 1000,
        maxDelay = 30000,
        backoffFactor = 2,
        retryCondition = (error: any) => {
            if (error instanceof Response) {
                return error.status >= 500 || error.status === 429;
            }
            return true;
        }
    } = options || {};

    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const signal = init?.signal ?? AbortSignal.timeout(timeout);
            const response = await (useProxy
                ? (() => {
                    const token = Config.PROXY_SERVER_TOKEN
                    const proxyServerUrl = Config.PROXY_SERVER_URL
                    if(!proxyServerUrl){
                        throw new Error("no proxy server added")
                    }
                    const proxyUrl = new URL(proxyServerUrl);
                    const headers = new Headers(init?.headers);
                    if (token) {
                        headers.append('Authorization', `Bearer ${token}`);
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
            if (!response.ok && retryCondition(response)) {
                throw response;
            }
            return response;

        } catch (error) {
            lastError = error;
            if (attempt === retries) {
                throw error;
            }
            const jitter = Math.random() * 0.3 * delay;
            await new Promise(resolve => setTimeout(resolve, delay + jitter));
            delay = Math.min(delay * backoffFactor, maxDelay);
        }
    }

    throw lastError;
}