import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = join(process.cwd(), "dist", "client");
const forbidden = [
  "hiddenRubric",
  "expectedEvidence",
  "referenceDoseRule",
  "OPENAI_API_KEY",
  "aspirin already administered for this presentation",
];
const configuredSecret = process.env.OPENAI_API_KEY?.trim();
if (configuredSecret) forbidden.push(configuredSecret);

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)])))
  ).flat();
}

const files = (await filesUnder(root)).filter((file) => [".html", ".js", ".css", ".map"].includes(extname(file)));
const violations: string[] = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const marker of forbidden) {
    if (content.includes(marker)) violations.push(`${file}: forbidden marker ${marker === configuredSecret ? "<configured secret>" : marker}`);
  }
}

if (violations.length) {
  throw new Error(`Client boundary check failed:\n${violations.join("\n")}`);
}
console.log(`Client boundary check passed across ${files.length} built files.`);
