import { CDNAllocation } from "../types/app"

export function parseCDNAllocation(allocations?: string): CDNAllocation[] {
    const raw = allocations?.trim()
    if (!raw) { return [] }
    return raw.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
        const [continent, area, cdn] = entry.split(',').map(v => v.trim())
        let priority = 2
        if (area === '*') {
            priority--
        }
        if (continent === '*') {
            priority--
        }
        return {
            continent: continent as string,
            area: area as string,
            cdn: cdn as string,
            priority: priority as number
        }
    }).filter(s => s.continent && s.area && s.cdn).sort((a, b) => b.priority - a.priority)
}


export function parseCDN(cdn?: string): Record<string, string> {
    if (!cdn) { return {} }
    cdn = cdn.trim()
    const cdns: Record<string, string> = {}
    for (let c of cdn.split(";")) {
        const parts = c.split(",").map(i => i.trim())
        const key = parts[0]
        const host = parts[1]
        if (key && host) {
            cdns[key] = host
        }
    }
    return cdns
}