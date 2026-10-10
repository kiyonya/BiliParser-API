import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  __dirname,
  "../node_modules/esa-cli/dist/commands/dev/mockWorker/devEntry.js"
);

if (!fs.existsSync(target)) {
  console.warn("[patch-esa-cli] mockWorker devEntry not found, skipping");
  process.exit(0);
}

const anchor = "globalThis.cache = cacheInstance;";
const inject = "globalThis.mockCache = cacheInstance;";
let source = fs.readFileSync(target, "utf-8");

if (source.includes(inject)) {
  console.log("[patch-esa-cli] already patched");
  process.exit(0);
}

if (!source.includes(anchor)) {
  console.warn("[patch-esa-cli] anchor not found, skipping");
  process.exit(0);
}

source = source.replace(anchor, `${anchor}\n    ${inject}`);
fs.writeFileSync(target, source);
console.log("[patch-esa-cli] patched mockWorker devEntry");
