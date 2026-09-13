import { cp } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const manifest = join(process.cwd(), "sites", "wrangler.json");
const server = join(dist, "server");

await cp(manifest, join(server, "wrangler.json"));

console.log("Prepared ChatGPT Sites Worker manifest in dist/server/wrangler.json.");
