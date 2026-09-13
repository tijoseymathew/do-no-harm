#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/mix-live-audio.py > out/audio-edit-summary.json
npm run lint
npx remotion render src/index.ts DoNoHarm90 out/live-render-intermediate.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=192k --log=error
ffmpeg -hide_banner -loglevel error -y -i out/live-render-intermediate.mp4 -i public/audio/live-mix.wav -map 0:v:0 -map 1:a:0 -t 90 -c:v copy -c:a aac -b:a 192k -movflags +faststart out/do-no-harm-90s.mp4
npx remotion still src/index.ts DoNoHarm90 out/do-no-harm-live-thumbnail.png --frame=60 --log=error
node scripts/verify.mjs
