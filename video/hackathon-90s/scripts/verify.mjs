import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const filename = "out/do-no-harm-90s.mp4";
const metadata = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filename,
    ],
    { encoding: "utf8" },
  ),
);
const v = metadata.streams.find((s) => s.codec_type === "video");
const a = metadata.streams.find((s) => s.codec_type === "audio");
assert.equal(v.width, 1920);
assert.equal(v.height, 1080);
assert.equal(v.codec_name, "h264");
assert.equal(v.r_frame_rate, "30/1");
assert.equal(Number(v.nb_read_frames), 2700);
assert.equal(Number(metadata.format.duration), 90);
assert.equal(a.codec_name, "aac");
const cues = JSON.parse(readFileSync("src/captions.json"));
for (let i = 0; i < cues.length; i++) {
  assert.ok(cues[i].endMs > cues[i].startMs);
  assert.ok(cues[i].startMs >= 0 && cues[i].endMs <= 90000);
  assert.ok(cues[i].text.split("\n").length <= 2);
  if (i) assert.ok(cues[i - 1].endMs <= cues[i].startMs);
}
const scan = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-i",
    filename,
    "-vf",
    "blackdetect=d=0.05:pix_th=0.05:pic_th=0.98",
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ],
  { encoding: "utf8" },
);
assert.equal(scan.status, 0);
writeFileSync("out/live-scan.log", scan.stderr);
const maxVolume = Number(scan.stderr.match(/max_volume: ([\-\d.]+)/)?.[1]);
const meanVolume = Number(scan.stderr.match(/mean_volume: ([\-\d.]+)/)?.[1]);
assert.ok(
  maxVolume > -20 && maxVolume < 0,
  "Audio must be audible and below clipping",
);
assert.ok(meanVolume > -35, "Reject a silent or inaudible export");
assert.ok(!scan.stderr.includes("black_start:"), "No black gaps");
const edits = JSON.parse(readFileSync("sources/live-audio/edit-manifest.json"));
assert.equal(edits.length, 18);
assert.ok(edits.every((c) => c.model === "gpt-live-1"));
const result = {
  verifiedAt: new Date().toISOString(),
  file: filename,
  width: v.width,
  height: v.height,
  fps: v.r_frame_rate,
  frames: Number(v.nb_read_frames),
  seconds: Number(metadata.format.duration),
  videoCodec: v.codec_name,
  audioCodec: a.codec_name,
  audioContent:
    "18 edited GPT Live voice takes; AI narration and dramatized dialogue",
  maximumVolumeDb: maxVolume,
  meanVolumeDb: meanVolume,
  blackGapsDetected: false,
  captionCount: cues.length,
  captionValidation:
    "Ordered, non-overlapping, at most two lines, within 90 seconds",
  providerAudioReceipts: edits.length,
  liveHumanMicrophoneVerification: false,
  realDebriefClaim: false,
};
writeFileSync(
  "out/live-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
