export async function proxyFetch(
    url: string | URL,
    init?: RequestInit,
    options?: {
        retries?: number;
        initialDelay?: number;
        maxDelay?: number;
        backoffFactor?: number;
        retryCondition?: (error: any) => boolean;
    }
) {
    const {
        retries = 3,
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
            const headers = new Headers(init?.headers);
            headers.append('Authorization', `Bearer ${process.env.X_VERCEL_PROXY_TOKEN}`);

            const proxyFetchUrl = new URL(`${process.env.X_VERCEL_PROXY_URL}`);
            proxyFetchUrl.searchParams.set('url', url.toString());

            const response = await fetch(proxyFetchUrl, {
                ...init,
                headers: headers
            }); 

            if (!response.ok && retryCondition(response)) {
                throw response;
            }

            return response;

        } catch (error) {
            lastError = error;
            if (attempt === retries) {
                throw error;
            }
            const jitter = Math.random() * 0.3 * delay; // 随机抖动
            await new Promise(resolve => setTimeout(resolve, delay + jitter));
            delay = Math.min(delay * backoffFactor, maxDelay);
        }
    }

    throw lastError;
}