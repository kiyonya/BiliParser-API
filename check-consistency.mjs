import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = dirname(fileURLToPath(import.meta.url))

function parseJsonc(text) {
    let out = ""
    let inString = false
    let inLineComment = false
    let inBlockComment = false

    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        const next = text[i + 1]

        if (inLineComment) {
            if (c === "\n" || c === "\r") {
                inLineComment = false
                out += c
            }
            continue
        }

        if (inBlockComment) {
            if (c === "*" && next === "/") {
                inBlockComment = false
                i++
            } else if (c === "\n" || c === "\r") {
                out += c
            }
            continue
        }

        if (inString) {
            out += c
            if (c === "\\") {
                out += next ?? ""
                i++
            } else if (c === '"') {
                inString = false
            }
            continue
        }

        if (c === '"') {
            inString = true
            out += c
            continue
        }

        if (c === "/" && next === "/") {
            inLineComment = true
            i++
            continue
        }

        if (c === "/" && next === "*") {
            inBlockComment = true
            i++
            continue
        }

        out += c
    }

    return JSON.parse(out.replace(/,\s*([}\]])/g, "$1"))
}

function readVars(path) {
    return parseJsonc(readFileSync(path, "utf8")).vars ?? {}
}

const rootVars = readVars(join(root, "wrangler.jsonc"))
const entryVars = readVars(join(root, "entry-cache", "wrangler.jsonc"))

const pairs = [
    ["CONFIG_VideoCDNStrategy", "CDN_STRATEGY"],
    ["SERVER_VERSION", "SERVER_VERSION"],
    ["FRONTWORKER_CTAG_TOKEN", "FRONTWORKER_CTAG_TOKEN"],
    ["CONFIG_CacheDataVersion", "CACHE_DATA_VERSION"],
]

const diffs = []

for (const [rootKey, entryKey] of pairs) {
    const a = rootVars[rootKey]
    const b = entryVars[entryKey]
    const same =
        a !== undefined &&
        b !== undefined &&
        String(a) === String(b)
    if (!same) {
        diffs.push(
            `${rootKey} (wrangler.jsonc) = ${JSON.stringify(a)}  <->  ${entryKey} (entry-cache/wrangler.jsonc) = ${JSON.stringify(b)}`
        )
    }
}

if (diffs.length > 0) {
    console.error("[check-consistency] 版本配置不一致:")
    for (const d of diffs) console.error("  - " + d)
    process.exit(1)
}
else{
    process.stdout.write("ok\n")
}
process.exit(0)
