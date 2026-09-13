import { rm } from "node:fs/promises";
import { join } from "node:path";

const localSecrets = join(process.cwd(), "dist", "server", ".dev.vars");
await rm(localSecrets, { force: true });

console.log("Removed local-only environment values from the Sites build.");
