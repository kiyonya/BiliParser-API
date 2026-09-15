import { CDNStrategy } from "../types"

export interface GeoContext {
    continent?: string
    country?: string
}

export abstract class Geolib {

    public static geo(cf?: CfProperties): GeoContext | undefined {
        if (!cf) { return undefined }
        return {
            continent: typeof cf.continent === 'string' ? cf.continent : undefined,
            country: typeof cf.country === 'string' ? cf.country : undefined
        }
    }

    public static matchStrategy(strategies: CDNStrategy[], geo?: GeoContext): CDNStrategy | undefined {
        return strategies.find(strategy =>
            (strategy.continent === '*' || geo?.continent === strategy.continent) &&
            (strategy.area === '*' || geo?.country === strategy.area)
        )
    }

    public static isCN(geo?: GeoContext): boolean {
        return geo?.continent === 'AS' && geo?.country === 'CN'
    }
}