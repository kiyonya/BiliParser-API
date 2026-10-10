import { CacheWarp, KVCacheDeleter, KVCacheGetter, KVCacheSetter } from "../../general/types/app";

export function createCfKVCacheSetter(kv: KVNamespace): KVCacheSetter {
    return async (key, data, expirationAt) => {
        await kv.put(key, JSON.stringify(data), {
            expiration: expirationAt
        })
    }
}

export function createCfKVCacheGetter(kv: KVNamespace): KVCacheGetter {
    return async <Data>(key: string): Promise<CacheWarp<Data> | null> => {
        return await kv.get<CacheWarp<Data>>(key, 'json')
    }
}

export function createCfKVCacheDeleter(kv: KVNamespace): KVCacheDeleter {
    return async (key) => {
        await kv.delete(key)
    }
}
