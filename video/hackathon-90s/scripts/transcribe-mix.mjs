import OpenAI from "openai";
import { createReadStream, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname;
process.loadEnvFile(root + "../../.env");
const client = new OpenAI({ maxRetries: 0 });
const result = await client.audio.transcriptions.create({
  file: createReadStream(root + "public/audio/live-mix.wav"),
  model: "gpt-transcribe",
  response_format: "json",
});
writeFileSync(
  root + "sources/live-audio/mix-transcription.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(result.text);
