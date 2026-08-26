export abstract class Config {
    public static EnableCacheDataValidation: boolean = process.env.CONFIG_EnableCacheDataValidation ? (process.env.CONFIG_EnableCacheDataValidation === 'true') : true

    public static readonly BiliVideoPlayUrlCacheTime = process.env.CONFIG_BiliVideoPlayUrlCacheTime ? parseInt(process.env.CONFIG_BiliVideoPlayUrlCacheTime) : 5400

    public static readonly BiliBangumiPlayUrlCacheTime = process.env.CONFIG_BiliBangumiPlayUrlCacheTime ? parseInt(process.env.CONFIG_BiliBangumiPlayUrlCacheTime) : 5400

    public static readonly BiliVideoInfoCacheTime = process.env.CONFIG_BiliVideoInfoCacheTime ? parseInt(process.env.CONFIG_BiliVideoInfoCacheTime) : 60 * 60 * 24

    public static readonly BiliBangumiEpisodesCacheTime = process.env.CONFIG_BiliBangumiEpisodesCacheTime ? parseInt(process.env.CONFIG_BiliBangumiEpisodesCacheTime) : 60 * 60 * 24 * 7

    public static readonly BiliBangumiInfoCacheTime = process.env.CONFIG_BiliBangumiInfoCacheTime ? parseInt(process.env.CONFIG_BiliBangumiInfoCacheTime) : 60 * 60 * 24 * 7

    public static readonly BiliLiveCacheTime = process.env.CONFIG_BiliLiveCacheTime ? parseInt(process.env.CONFIG_BiliLiveCacheTime) : 60

    public static readonly UGCSeasonArchieveCacheTime = process.env.CONFIG_UGCSeasonArchieveCacheTime ? parseInt(process.env.CONFIG_UGCSeasonArchieveCacheTime) : 86400

    public static readonly BiliDanmakuCacheTime = process.env.CONFIG_BiliDanmakuCacheTime ? parseInt(process.env.CONFIG_BiliDanmakuCacheTime) : 1800

    public static readonly ProxyFetchMaxRetries = process.env.CONFIG_ProxyFetchMaxRetries ? parseInt(process.env.CONFIG_ProxyFetchMaxRetries) : 3
}