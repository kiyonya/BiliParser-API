
export type ResponseCacheSetter = (key: URL, response: Response) => Promise<void>
export type ResponseCacheGetter = (key: URL) => Promise<Response | undefined>
export type ResponseCacheDeleter = (key: URL) => Promise<any>

export type CustomCacheHeader = "_CACHE_AT" | "_CACHE_MAXAGE" | "_CACHE_KEY" | "_STATUS_CODE" | "_STATUS_TEXT" | '_RESPONSE_CACHE'

export class ManualResponseCache {

    private customHeaders: CustomCacheHeader[] = ['_CACHE_AT', '_CACHE_KEY', '_CACHE_MAXAGE', '_STATUS_CODE', '_STATUS_TEXT', '_RESPONSE_CACHE']
    private setter?: ResponseCacheSetter
    private getter?: ResponseCacheGetter
    private deleter?: ResponseCacheDeleter
    private shouldCacheResponse = (status: number) => status >= 200 && status < 400

    constructor(options: { setter?: ResponseCacheSetter, getter?: ResponseCacheGetter, deleter?: ResponseCacheDeleter, shouldCacheResponse?: (status: number) => boolean }) {
        const { setter, getter, deleter, shouldCacheResponse } = options;
        if (shouldCacheResponse) { this.shouldCacheResponse = shouldCacheResponse }
        this.setter = setter
        this.getter = getter
        this.deleter = deleter
    }

    public getMaxage(res: Response) {
        const cacheHeader = res.headers.get("cache-control")
        if (!cacheHeader) { return null }
        if (!this.isCacheHeaderCouldCache(cacheHeader)) { return null }
        const matchAge =
            cacheHeader.match(/(?:^|,)\s*s-maxage\s*=\s*(\d+)/i)?.[1] ||
            cacheHeader.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i)?.[1] ||
            null
        return matchAge ? parseInt(matchAge, 10) : null
    }

    public isCacheHeaderCouldCache(cacheHeader: string | null) {
        if (!cacheHeader) { return false }
        return !cacheHeader.includes("no-cache") && !cacheHeader.includes("no-store")
    }

    public async put(key: URL | string, res: Response): Promise<void> {
        try {
            if (!this.setter) { return }
            const status = res.status;
            const statusText = res.statusText;
            const maxAge = this.getMaxage(res)
            const isCacheable = Boolean(this.shouldCacheResponse(status) && !res.bodyUsed && maxAge && maxAge > 0)
            if (!isCacheable) { return }

            const cacheAt = Math.floor(Date.now() / 1000)
            const urlKey = typeof key === 'string' ? new URL(key) : key;
            const customHeaders: Partial<Record<CustomCacheHeader, string>> = {
                _CACHE_MAXAGE: String(maxAge),
                _CACHE_KEY: urlKey.href,
                _CACHE_AT: String(cacheAt),
                _STATUS_CODE: String(status),
                _STATUS_TEXT: String(statusText),
                _RESPONSE_CACHE: "",
            }

            const headers = new Headers(res.headers)
            for (const [h, v] of Object.entries(customHeaders)) {
                headers.append(h, v)
            }
            const mockResponse = new Response(res.body, {
                status: 200,
                headers: headers,
                statusText: statusText
            })
            await this.setter(urlKey, mockResponse)
        } catch (error) {

        }
    }

    public async get(key: URL | string, options: { removeHeaders: string[], headerModifier?: (headers: Headers, cacheAt: number, maxage: number) => Headers, deleteExpired?: boolean } = { removeHeaders: [], headerModifier: undefined, deleteExpired: true }) {
        try {
            if (!this.getter) { return undefined }

            const { removeHeaders, headerModifier, deleteExpired } = options
            const urlKey = typeof key === 'string' ? new URL(key) : key;
            const res = await this.getter(urlKey)
            if (!res) { return undefined }

            const isResCache = res.headers.has("_RESPONSE_CACHE" satisfies CustomCacheHeader)
            if (isResCache) {
                const cacheKey = res.headers.get("_CACHE_KEY" satisfies CustomCacheHeader)
                const isCacheKeyMatch = cacheKey === urlKey.href
                if (!isCacheKeyMatch) { return undefined }

                //
                const cacheAt = parseInt(res.headers.get('_CACHE_AT' satisfies CustomCacheHeader)!)
                const cacheMaxage = res.headers.has("_CACHE_MAXAGE" satisfies CustomCacheHeader) ? parseInt(res.headers.get('_CACHE_MAXAGE' satisfies CustomCacheHeader)!) : this.getMaxage(res)
                const status = parseInt(res.headers.get('_STATUS_CODE' satisfies CustomCacheHeader)!)
                const statusText = res.headers.get('_STATUS_TEXT' satisfies CustomCacheHeader) || undefined
                const now = Math.floor(Date.now() / 1000)
                const age = Math.max(0, now - cacheAt)
                //
                const isCacheOk = Boolean(cacheAt) && Boolean(cacheMaxage) && status >= 200 && this.shouldCacheResponse(status)
                if (!isCacheOk) { return undefined }

                //
                const isExpired = age >= cacheMaxage!
                if (isExpired) {
                    if (deleteExpired && this.deleter) {
                        try {
                            this.deleter(urlKey)
                        } catch (error) { }
                    }
                    return undefined
                }
                //

                let headers = new Headers(res.headers)
                headers.set("age", String(age))
                for (const h of [...this.customHeaders, ...removeHeaders]) headers.delete(h)
                if (headerModifier) {
                    headers = headerModifier(headers, cacheAt, cacheMaxage!)
                }
                const bodyLess = [101, 204, 205, 304].includes(status)
                const restoreResponse = new Response(bodyLess ? null : res.body, {
                    status: status,
                    statusText: statusText,
                    headers,
                })
                return restoreResponse;
            }
            return undefined
        } catch (error) {
            return undefined
        }
    }
}