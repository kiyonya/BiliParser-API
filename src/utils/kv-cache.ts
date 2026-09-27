
import { Config } from "../config"
import { AppContext, CacheResult, CacheWarp } from "../types"
import z from "zod";
export default class KVCache {
    private kvnamespace: string
    constructor(kvbind: string) {
        this.kvnamespace = kvbind
    }

    protected async validateSchema<Data = any>(data: Data, schema?: z.ZodType<Data>) {
        return Config.ENABLE_CAHCE_DATA_VALIDATION ? (schema ? (await schema.safeParseAsync(data)).success : true) : true
    }

    public async setKVCache<Data = any>(ctx: AppContext, key: string, data: Data, expirationAt: number, schema?: z.ZodType<Data>): Promise<void> {
        if(!await this.validateSchema(data,schema)){return}
        const warp: CacheWarp<Data> = {
            data: data,
            expirationAt: expirationAt,
            key: key
        }
        await this.setKVCacheRaw(ctx, key, JSON.stringify(warp), expirationAt)
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
            const isDataValid = await this.validateSchema(data,schema)
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