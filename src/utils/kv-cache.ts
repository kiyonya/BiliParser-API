
import { AppContext } from "../types"
export interface KVCacheWarp<Data = any> {
    data: Data,
    expirationAt: number,
    key:string
}
export default class KVCache {
    private kvnamespace: string
    constructor(kvbind: string) {
        this.kvnamespace = kvbind
    }
    public async setKVCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number): Promise<void> {
        //@ts-ignore
        const ns: KVNamespace | undefined = ctx.env[this.kvnamespace]
        if (!ns) { return }
        const warp: KVCacheWarp<Data> = {
            data: data,
            expirationAt: expirationAt,
            key:key
        }
        await ns.put(key, JSON.stringify(warp), {
            expiration: expirationAt
        })
    }
    public async getKVCache<Data = any>(ctx: AppContext, key: string): Promise<{ data: Data, raw: KVCacheWarp<Data> } | null> {
        //@ts-ignore
        const ns: KVNamespace | undefined = ctx.env[this.kvnamespace]
        if (!ns) { return null }
        const cached = await ns.get<KVCacheWarp<Data>>(key, 'json')
        if (cached) {
            const nowS = Math.floor(Date.now() / 1000)
            const isExpried = nowS >= cached.expirationAt
            if (isExpried) {
                await ns.delete(key)
                return null
            }
            const data = cached.data
            return {
                data: data,
                raw: cached
            }
        }
        return null
    }
}