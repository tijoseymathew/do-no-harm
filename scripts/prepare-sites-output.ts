import { cp } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const client = join(dist, "client");
const worker = join(dist, "server", "index.js");

await cp(worker, join(client, "_worker.js"));

console.log("Prepared ChatGPT Sites Worker in dist/client/_worker.js.");
