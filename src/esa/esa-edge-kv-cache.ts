import { CacheWarp, KVCacheDeleter, KVCacheGetter, KVCacheSetter } from "../../general/types/app";

export function createEsaKVCacheSetter(kv: EdgeKV): KVCacheSetter {
    return async (key, data, expirationAt) => {
        await kv.put(key, JSON.stringify(data))
    }
}

export function createEsaKVCacheGetter(kv: EdgeKV): KVCacheGetter {
    return async <Data>(key: string): Promise<CacheWarp<Data> | null> => {
        const cache = await kv.get(key, { type: "json" }) as CacheWarp<Data> | null
        return cache
    }
}

export function createEsaKVCacheDeleter(kv: EdgeKV): KVCacheDeleter {
    return async (key) => {
        await kv.delete(key)
    }
}
