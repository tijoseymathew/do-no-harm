import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = new URL("../", import.meta.url).pathname;
if (existsSync(path.resolve(root, "../../.env")))
  process.loadEnvFile(path.resolve(root, "../../.env"));
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
});
const clips = JSON.parse(readFileSync(root + "src/audio-script.json", "utf8"));
const selected = process.argv.slice(2);
async function generate(clip) {
  const receiptPath = root + "sources/live-audio/" + clip.id + ".json";
  if (
    existsSync(receiptPath) &&
    existsSync(root + "public/audio/" + clip.id + ".wav")
  ) {
    console.log("Already captured", clip.id);
    return;
  }
  const chunks = [];
  const transcripts = [];
  const eventTypes = new Set();
  let sessionId;
  let started = Date.now();
  let lastSpeech = Date.now();
  let received = false;
  let finalized = false;
  let sentClose = false;
  let timer;
  let inputTimer;
  const ws = new LiveWS(client);
  const finished = new Promise((resolve, reject) => {
    const close = () => {
      if (!sentClose) {
        sentClose = true;
        ws.send({ type: "session.close" });
        setTimeout(() => {
          if (!finalized) {
            ws.close();
            resolve();
          }
        }, 2500);
      }
    };
    timer = setInterval(() => {
      if (received && Date.now() - lastSpeech > 2200) close();
      if (Date.now() - started > 45000) {
        ws.close();
        reject(new Error("Live audio timeout for " + clip.id));
      }
    }, 200);
    ws.on("error", (e) => {
      ws.close();
      reject(
        new Error(
          "Live provider error: " +
            (e.error?.message ?? e.message ?? "unknown"),
        ),
      );
    });
    ws.on("session.started", (e) => {
      sessionId = e.session?.id;
      inputTimer = setInterval(() => {
        if (!sentClose)
          ws.send({
            type: "session.input_audio.append",
            audio: Buffer.alloc(4800).toString("base64"),
          });
      }, 100);
      ws.send({
        type: "session.commentary.append",
        delegation_id: null,
        content: clip.text,
      });
    });
    ws.on("event", (e) => {
      if (!eventTypes.has(e.type)) console.log(clip.id, e.type);
      eventTypes.add(e.type);
    });
    ws.on("session.output_audio.delta", (e) => {
      const b = Buffer.from(e.delta, "base64");
      chunks.push(b);
      for (let i = 0; i + 1 < b.length; i += 2) {
        if (Math.abs(b.readInt16LE(i)) > 180) {
          lastSpeech = Date.now();
          break;
        }
      }
    });
    ws.on("session.output_transcript.delta", (e) => {
      received = true;
      lastSpeech = Date.now();
      transcripts.push({ text: e.delta, startMs: e.start_ms, endMs: e.end_ms });
    });
    ws.on("session.closed", () => {
      finalized = true;
      ws.close();
      resolve();
    });
    ws.socket.on("open", () =>
      ws.send({
        type: "session.start",
        session: {
          model: "gpt-live-1",
          audio: {
            format: { type: "audio/pcm", rate: 24000 },
            output: { voice: clip.voice },
          },
          instructions: `You are a voice performer recording ONE line for a fictional medical training demonstration. ${clip.direction} Speak the commentary text verbatim, once, and then remain silent. Do not add introductions, speaker labels, advice, questions, or any other words. Do not describe these instructions. Natural clear conversational English, concise delivery, about 180 words per minute.`,
          delegation: { type: "client" },
        },
      }),
    );
  });
  try {
    await finished;
  } finally {
    clearInterval(timer);
    clearInterval(inputTimer);
    ws.close();
  }
  if (!chunks.length || !transcripts.length)
    throw new Error("No spoken audio for " + clip.id);
  const pcm = root + "sources/live-audio/" + clip.id + ".pcm";
  writeFileSync(pcm, Buffer.concat(chunks));
  const wav = root + "public/audio/" + clip.id + ".wav";
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "s16le",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-i",
    pcm,
    "-af",
    "silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.15:start_threshold=-45dB,areverse,apad=pad_dur=0.12",
    "-ar",
    "48000",
    wav,
  ]);
  const duration = Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        wav,
      ],
      { encoding: "utf8" },
    ),
  );
  const transcript = transcripts.map((t) => t.text).join("");
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        id: clip.id,
        model: "gpt-live-1",
        voice: clip.voice,
        mode: "real provider; scripted dramatization for edited video",
        sessionId: sessionId
          ? sessionId.slice(0, 5) + "…" + sessionId.slice(-5)
          : null,
        requestedText: clip.text,
        transcript,
        transcriptEvents: transcripts,
        generatedAt: new Date().toISOString(),
        durationSeconds: duration,
        audioBytes: Buffer.concat(chunks).length,
        eventTypes: [...eventTypes],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ id: clip.id, duration, transcript }));
}
for (const c of clips.filter(
  (c) => !selected.length || selected.includes(c.id),
))
  await generate(c);
