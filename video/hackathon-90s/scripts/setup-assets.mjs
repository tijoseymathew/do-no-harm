import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = new URL("../", import.meta.url).pathname;
const repo = path.resolve(root, "../..");
for (const dir of [
  "public",
  "public/audio",
  "sources",
  "sources/live-audio",
  "out",
])
  mkdirSync(path.join(root, dir), { recursive: true });
for (const [source, target] of [
  [
    "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    "public/Inter.woff2",
  ],
  [
    "node_modules/@fontsource-variable/inter/LICENSE",
    "public/Inter-LICENSE.txt",
  ],
  ["docs/evidence/phase-05/real-examiner-checkpoint.json", "src/proof.json"],
]) {
  const from = path.join(repo, source);
  if (!existsSync(from))
    throw new Error(
      `Missing ${source}. Run npm ci at the repository root first.`,
    );
  copyFileSync(from, path.join(root, target));
}
// Only bootstrap absent captions. The mix script replaces this scaffold with edited speech timings.
if (!existsSync(path.join(root, "src/captions.json"))) {
  const script = JSON.parse(
    readFileSync(path.join(root, "src/audio-script.json"), "utf8"),
  );
  const captions = script.map((c) => ({
    text: c.text,
    startMs: Math.round(c.start * 1000),
    endMs: Math.round(c.end * 1000),
    timestampMs: null,
    confidence: null,
    role: c.role,
  }));
  writeFileSync(
    path.join(root, "src/captions.json"),
    JSON.stringify(captions, null, 2) + "\n",
  );
}
const roomIndex = process.argv.indexOf("--room");
if (roomIndex !== -1) {
  const recording = process.argv[roomIndex + 1];
  if (!recording || !existsSync(recording))
    throw new Error("--room requires a local raw recording path");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "2",
    "-i",
    path.resolve(recording),
    "-t",
    "6",
    "-vf",
    "crop=1560:600:180:120",
    "-an",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "19",
    path.join(root, "public/room.mp4"),
  ]);
}
console.log(
  "Local asset directories, font, receipt and caption scaffold are ready. No provider requests made.",
);
