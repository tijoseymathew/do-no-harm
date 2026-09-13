# DO NO HARM

A browser emergency-room simulation for medical students. Talk to a fictional patient with **GPT-Live-1**, use bedside equipment, make treatment decisions, and receive an **Agents API** examiner debrief linked to the actions actually recorded.

[Try the deployed app](https://do-no-harm-simulator.tijoseymathew.chatgpt.site/) · [Submitted demo](https://www.youtube.com/watch?v=G1_KK_b_cj4) · [Submission review](docs/submission-review.md)

One fictional chest-pain case supports timely care, delayed care, and inappropriate-attempt paths. Clinical content remains **unreviewed**; this is a formative prototype.

## Try the complete flow

1. Connect voice, allow microphone access, and ask when the pressure started. Speak naturally to interrupt. Microphone mute/unmute and disconnect are explicit controls; text remains available.
2. Assess the patient and explore the monitor, investigations, medication, oxygen/IV, notes, and call station. “Prepare aspirin” opens a draft with missing parameters left unset. Preparation never counts as administration.
3. Record a handoff at the Call station. The examiner can ask one neutral question grounded in the run; it cannot perform treatment.
4. Select Finish. Open a feedback citation to inspect its exact evidence event, then review the next-practice objective. Provider latency or failure preserves the evidence and exposes retry.

## What the two integrations do

**GPT-Live-1:** server-created WebRTC sessions carry full-duplex audio. The browser accumulates input transcripts and sends them through the application’s bounded fact, visible-state, and draft-order workflow. Client delegations receive those grounded results through `session.commentary.append` using the original delegation ID. Transcript corrections remain append-only. The current language router is deliberately bounded; arbitrary conversation understanding and human microphone interruption verification remain limitations.

**Agents API:** a real managed `gpt-6-astra` session reads evidence through application functions and continues across checkpoints. Only schema-valid output with resolvable evidence citations is accepted. Finish freezes a named evidence cutoff; the examiner returns six criterion outcomes, a strength, a priority improvement, and a next-practice objective. It cannot administer treatment or alter the deterministic scenario engine.

The server owns physiology, simulation time, revisions, idempotency, treatment receipts, and append-only evidence. Hosted runs persist in Sites D1. The browser receives student-safe case data, never the project API key or hidden rubric. See [provider contracts](docs/provider-integrations.md) and [clinical review checklist](docs/clinical-review-checklist.md).

## Install and verify

Node.js 22.6+ and npm are required.

```bash
npm ci
npm run verify
npx playwright install chromium
npm run test:browser
```

`verify` runs type checks, unit/contract tests, the production build, and a browser-bundle boundary scan. Browser tests cover equipment, medication validation, recovery, voice delegation with a simulated WebRTC connection, and citation-linked debriefs. They do not prove real microphone audio or provider access. Generated browser evidence is local verification output; review it before committing.

Real provider verification, with a server-only `OPENAI_API_KEY` in `.env`:

```bash
npm run probe:examiner
npm run verify:phase06:real
```

The key needs Live and Agents API access. Sanitized receipts are retained under `docs/evidence/`; unavailable providers are not represented as real success. Local development without a key uses an explicitly labeled examiner verification fixture.

## Develop and build

```bash
npm run dev:server
npm run dev:client
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Express server. Copy `.env.example` to `.env` for real provider access; never use a `VITE_` variable for credentials.

```bash
npm run build
npm start -- --port 3000
```

The production build uses vinext and a Cloudflare Worker, matching ChatGPT Sites. `npm run build:local` followed by `npm run start:local` is the separate Express build. `.openai/hosting.json` identifies the existing Site; deployments must preserve its public audience and D1 binding.

[Product specification](specs.md) · [Historical implementation phases](docs/phases/README.md) · [Video source project](video/hackathon-90s/README.md)
