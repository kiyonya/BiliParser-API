import z from "zod"
import { AppContext, CacheDeleter, CacheGetter, CacheLayerType, CacheSetter, CacheStatus, CacheWarp } from "../types/app"
import { md5String } from "./hashlib"
import { BiliTypes } from "../types/bili"
import { AppHeaders } from "../shared/headers"

export type CacheMode = "kv" | "edge" | "all"

export class AppCache {

    protected ctx: AppContext
    private cacheLayers: AppCacheLayer[] = []

    constructor(ctx: AppContext, cacheLayers: AppCacheLayer[] = []) {
        if (!ctx.config) {
            throw new Error("context is not initialized")
        }
        this.ctx = ctx
        this.cacheLayers = cacheLayers
    }

    public addCacheLayer(...cacheLayers: AppCacheLayer[]) {
        this.cacheLayers.push(...cacheLayers)
    }

    protected layerCacheStatus = new Map<string, { layer: string, status: CacheStatus }[]>()
    public minExpirationTime: number = Infinity

    public get cacheHeaders(): Record<string, string> {
        //X-Server-Cache-Status:acedfs:webCache[MISS],kvCache[HIT];acssdk:webCache[HIT]
        const headers: Record<string, string> = {}
        const headerParts: string[] = []
        for (const [key, statusList] of this.layerCacheStatus.entries()) {
            const keyHash = md5String(key).slice(0, 6)
            const statusParts: string[] = []
            for (const status of statusList) {
                statusParts.push(`${status.layer}[${status.status}]`)
            }
            headerParts.push(`${keyHash}:${statusParts.join(",")}`)
        }
        headers[AppHeaders.SERVER_CACHE_STATUS] = headerParts.length ? headerParts.join("; ") : 'MISS'
        return headers
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        if (!schema || !this.ctx.config.ENABLE_CACHE_DATA_VALIDATION) { return true }
        return (await schema.safeParseAsync(data)).success
    }

    private pickLayers(mode?: CacheLayerType) {
        let pickLayers: AppCacheLayer[] = []
        switch (mode) {
            case undefined:
            case 'any':
            default:
                pickLayers = this.cacheLayers
                break
            case 'consistent':
                pickLayers = this.cacheLayers.filter(i => i.layerType === 'consistent' || i.layerType === 'any')
                break
            case 'isolate':
                pickLayers = this.cacheLayers.filter(i => i.layerType === 'isolate' || i.layerType === 'any')
                break
        }
        return pickLayers
    }

    public async setCache<Data = any>(key: string, data: Data, expirationAtCall: number | ((data: Data) => number), schema?: z.ZodType<Data>, mode?: CacheLayerType): Promise<void> {
        try {
            if (!this.cacheLayers.length) { return }
            if (!await this.validateSchema(data, schema)) { return }
            const expirationAt: number = typeof expirationAtCall === 'function'
                ? expirationAtCall(data)
                : expirationAtCall;
            const now = Math.floor(Date.now() / 1000)
            if (expirationAt <= now) { return }

            let operationLayers: AppCacheLayer[] = this.pickLayers(mode)
            if (!operationLayers.length) { return }


            const layerSetPromise: Promise<void>[] = []
            for (const layer of operationLayers) {
                layerSetPromise.push(layer.set<Data>(this.ctx, key, data, expirationAt))
            }
            await this.ctx.defer(Promise.allSettled(layerSetPromise))
        } catch (error) {
            return;
        }
    }

    public async getCache<Data = any>(key: string, schema?: z.ZodType<Data>, mode?: CacheLayerType): Promise<Data | null> {
        try {
            if (!this.cacheLayers.length) { return null }
            let operationLayers: AppCacheLayer[] = this.pickLayers(mode)
            if (!operationLayers.length) { return null }

            let hitCache: CacheWarp<Data> | null = null
            const missLayers: AppCacheLayer[] = []
            const invalidLayers: AppCacheLayer[] = []
            const now = Math.floor(Date.now() / 1000)

            const cacheStatus: { layer: string, status: CacheStatus }[] = []
            for (const layer of operationLayers) {
                const layerName = layer.layerName
                const layerCache = await layer.get<Data>(this.ctx, key)
                if (!layerCache) {
                    missLayers.push(layer);
                    cacheStatus.push({ layer: layerName, status: 'MISS' })
                    continue
                }
                const expirationAt = layerCache.expirationAt
                if (expirationAt <= now) {
                    invalidLayers.push(layer);
                    cacheStatus.push({ layer: layerName, status: "EXPIRED" })
                    continue
                }
                if (!await this.validateSchema(layerCache.data, schema)) {
                    invalidLayers.push(layer);
                    cacheStatus.push({ layer: layerName, status: "MISS" })
                    continue
                }
                if (expirationAt < this.minExpirationTime) {
                    this.minExpirationTime = expirationAt
                }
                hitCache = layerCache
                cacheStatus.push({ layer: layerName, status: "HIT" })
                break
            }
            this.layerCacheStatus.set(key, cacheStatus)

            if (invalidLayers.length) {
                await Promise.allSettled(invalidLayers.map(l => l.delete(this.ctx, key)))
            }
            if (hitCache && missLayers.length && this.ctx.config.ENABLE_CACHE_LAYER_SYNC) {
                await this.ctx.defer(Promise.allSettled(missLayers.map(l => l.setWarp(this.ctx, key, hitCache!))))
            }

            return hitCache?.data ?? null
        } catch (error) {
            return null;
        }
    }

    public static createLayer(options: { getter: CacheGetter, setter: CacheSetter, deleter: CacheDeleter, layerType: CacheLayerType, layerName: string }) {
        return new AppCacheLayer(options)
    }
}

export class AppCacheKey {

    private readonly SERVER_STATUS_HASH: string
    constructor(ctx: AppContext) {
        if (!ctx.config) {
            throw new Error("context is not initialized")
        }
        this.SERVER_STATUS_HASH = ctx.config.SERVER_STATUS_HASH
    }

    public cookie() {
        return `${this.SERVER_STATUS_HASH}:BILI_COMMON_COOKIES`
    }

    public videoInfoBv(bvid: string) {
        return `${this.SERVER_STATUS_HASH}:videoInfo:bvid:${bvid}`
    }

    public videoInfoAv(avid: number) {
        return `${this.SERVER_STATUS_HASH}:videoInfo:aid:${avid}`
    }

    public videoPlayUrl(cid: number, qn: number, platform: BiliTypes.RES.Video.VideoPlayPlatform, format: BiliTypes.RES.Video.VideoPlayFormat) {
        return `${this.SERVER_STATUS_HASH}:videoPlayUrl:${cid}:${qn}:${platform}:${format}`
    }

    public videoSubtitles(cid: number) {
        return `${this.SERVER_STATUS_HASH}:subtitle:${cid}`
    }

    public userArchieves(mid: number, seasonId: number, page: number, pageSize: number) {
        return `${this.SERVER_STATUS_HASH}:userArchieves:${mid}:${seasonId}:${page}:${pageSize}`
    }

    public userFav(fid: number, keyword: string | undefined, page: number, pageSize: number) {
        const keywordHash = keyword ? md5String(keyword.trim()) : "all"
        return `${this.SERVER_STATUS_HASH}:userFav:${fid}:${keywordHash}:${page}:${pageSize}`
    }

    public bangumiInfo(seasonId?: number, episodeId?: number) {
        if (seasonId) {
            return `${this.SERVER_STATUS_HASH}:bangumiInfo:season:${seasonId}`
        }
        return `${this.SERVER_STATUS_HASH}:bangumiInfo:episode:${episodeId}`
    }

    public bangumiEpisodes(seasonId?: number) {
        return `${this.SERVER_STATUS_HASH}:bangumiEpisodes:season:${seasonId}`
    }

    public danmaku(cid: number) {
        return `${this.SERVER_STATUS_HASH}:danmaku:${cid}`
    }

    public danmakuJSON(cid: number) {
        return `${this.SERVER_STATUS_HASH}:danmakuJSON:${cid}`
    }

    public live(
        roomId: number,
        platform: "xlive" | "h5",
        codec: "avc" | "hevc",
        format: "fmp4" | "flv" | "ts",
        protocol: "stream" | "hls"
    ) {
        return `${this.SERVER_STATUS_HASH}:live:${roomId}:${platform}:${codec}:${format}:${protocol}`
    }

    public search(
        keyword: string,
        type: BiliTypes.RES.Search.SearchType,
        page: number,
        pageSize: number,
        order?: string
    ) {
        const keywordHash = md5String(keyword.trim())
        return `${this.SERVER_STATUS_HASH}:search:${type}:${keywordHash}:${page}:${pageSize}:${order ? order : "common_order"}`
    }
}

export class AppCacheLayer {
    protected getter: CacheGetter
    protected setter: CacheSetter
    protected deleter: CacheDeleter
    public layerType: CacheLayerType
    public layerName: string

    constructor(options: { getter: CacheGetter, setter: CacheSetter, deleter: CacheDeleter, layerType: CacheLayerType, layerName: string }) {
        const { getter, setter, deleter, layerType, layerName } = options
        this.getter = getter
        this.setter = setter
        this.deleter = deleter
        this.layerType = layerType
        this.layerName = layerName
    }

    public async get<Data = any>(ctx: AppContext, key: string): Promise<CacheWarp<Data> | null> {
        if (!this.getter) { return null }
        const cacheWarp = await this.getter(ctx, key)
        if (cacheWarp) {
            return cacheWarp
        }
        return null
    }

    public async set<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number): Promise<void> {
        if (!this.setter) { return }
        const now = Math.floor(Date.now() / 1000)
        if (expirationAt <= now) { return }
        const warp: CacheWarp<Data> = {
            expirationAt: expirationAt,
            data: data,
            key: key
        }
        await this.setWarp<Data>(ctx, key, warp)
    }

    public async setWarp<Data = any>(ctx: AppContext, key: string, warp: CacheWarp<Data>) {
        if (!this.setter) { return }
        await this.setter(ctx, key, warp)
    }

    public async delete(ctx: AppContext, key: string): Promise<void> {
        if (!this.deleter) { return }
        await this.deleter(ctx, key)
    }
}
