
import { Config } from "../config"
import { AppContext, CacheResult, CacheWarp } from "../types"
import z from "zod";
export default class KVCache {
    private kvnamespace: string
    constructor(kvbind: string) {
        this.kvnamespace = kvbind
    }
    public async setKVCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number, validate?: z.ZodType<Data>): Promise<void> {
        const isDataValid = Config.EnableCacheDataValidation ? (validate ? validate.safeParse(data).success : true) : true
        if (!isDataValid) { return }
        //@ts-ignore
        const ns: KVNamespace | undefined = ctx.env[this.kvnamespace]
        if (!ns) { return }
        const warp: CacheWarp<Data> = {
            data: data,
            expirationAt: expirationAt,
            key: key
        }
        await ns.put(key, JSON.stringify(warp), {
            expiration: expirationAt
        })
    }
    public async getKVCache<Data = any>(ctx: AppContext, key: string, validate?: z.ZodType<Data>): Promise<CacheResult | null> {
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
            const isDataValid = Config.EnableCacheDataValidation ? (validate ? validate.safeParse(data).success : true) : true
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