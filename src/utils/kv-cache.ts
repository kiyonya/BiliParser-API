
import { Config } from "../config"
import { AppContext, CacheResult, CacheWarp } from "../types"
import z from "zod";
export default class KVCache {
    private kvnamespace: string
    constructor(kvbind: string) {
        this.kvnamespace = kvbind
    }
    public async setKVCacheRaw(ctx: AppContext, key: string, serialized: string, expirationAt: number): Promise<void> {
        //@ts-ignore
        const ns: KVNamespace | undefined = ctx.env[this.kvnamespace]
        if (!ns) { return }
        await ns.put(key, serialized, {
            expiration: expirationAt
        })
    }
    public async getKVCache<Data = any>(ctx: AppContext, key: string, schema?: z.ZodType<Data>): Promise<CacheResult | null> {
        //@ts-ignore
        const ns: KVNamespace | undefined = ctx.env[this.kvnamespace]
        if (!ns) { return null }
        const cached = await ns.get<CacheWarp<Data>>(key, 'json')
        if (cached) {
            const nowS = Math.floor(Date.now() / 1000)
            const isExpried = nowS >= cached.expirationAt
            if (isExpried) {
                await ns.delete(key)
                return null
            }
            const data = cached.data
            const isDataValid = Config.ENABLE_CAHCE_DATA_VALIDATION ? (schema ? schema.safeParse(data).success : true) : true
            if (isDataValid) {
                return {
                    data: data,
                    raw: cached,
                    valid: isDataValid
                }
            }
            else {
                await ns.delete(key)
                return null
            }
        }
        return null
    }
}