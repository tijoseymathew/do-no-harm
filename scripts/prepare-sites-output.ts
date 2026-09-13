import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const client = join(dist, "client");
const worker = join(dist, "server", "index.js");
const sites = join(dist, "sites");

await rm(sites, { recursive: true, force: true });
await mkdir(sites, { recursive: true });
await cp(client, sites, { recursive: true });
await cp(worker, join(sites, "_worker.js"));

console.log("Prepared ChatGPT Sites output in dist/sites.");
