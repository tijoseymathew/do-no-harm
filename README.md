# DO NO HARM

An interactive emergency-room simulation for medical students: the Live voice opens with an authored briefing (formative simulation, student role, patient identity, complaint, visible appearance, and the task to assess and manage), then the student assesses a fictional patient, operates bedside equipment, chooses medication doses, administers treatment, reassesses, and receives a visual evidence-linked debrief.

Phase 01 provides the application skeleton, versioned case contracts, an unreviewed fictional chest-pain draft, and independently runnable real-provider probes.

Phase 03 adds a deterministic server scenario engine behind the Three.js emergency bay at `/`. The engine owns simulation time, physiology, connected and intermittent observations, treatment state, bounded scenario branches, state revisions, administration receipts, and append-only events. The original voice connection probe remains at `/probe`.

The bedside requires no provider credentials. Each reload creates an isolated in-memory run through `POST /api/runs`; commands carry the current revision and an idempotency key. The server serializes mutations, rejects stale commands, and persists replay records under ignored local `runs/` files. Pause stops simulation time, pending effects, waveforms, and fluid delivery together. The room exposes monitor connections, stale BP behavior, validated aspirin administration, IV-fluid accounting, and senior acknowledgment. Diagnostic ECG/results, oxygen settings, notes, and handoff remain later-phase work.

The case timing, deterioration, aspirin effect marker, and fluid limits are still unreviewed development fixtures. They are visibly labeled and cannot establish clinical acceptance. The current rule review record is in `docs/evidence/phase-03/clinical-rule-review.json`.

- [Product specification](specs.md): experience, room layout, clinical interactions, architecture, and demo requirements.
- [Implementation phases](docs/phases/README.md): seven verifiable phases with dependencies and acceptance checklists.
- [Provider contracts](docs/provider-integrations.md): the exact Live WebRTC and Agents API boundaries.
- [Clinical review checklist](docs/clinical-review-checklist.md): the sign-off required before this draft case can be treated as reviewed education content.

## Requirements

- Node.js 22.6 or newer (tested with Node.js 24.15.0)
- npm 11 or newer
- A project API key with GPT-Live and Agents API access for the real probes
- A microphone and a browser served from localhost or HTTPS for the Live probe

## Install and verify

```bash
npm ci
npm run verify
```

`npm run verify` type-checks the browser and server boundaries separately, validates the case contracts, builds both targets, and scans the browser output for provider credentials and hidden rubric markers. It does not make provider requests and cannot satisfy a real-provider gate.

For browser verification after building:

```bash
npx playwright install chromium
npm run test:browser
```

The browser suite starts the built server on port 3102, checks the room at 1440×900 and 1280×720, exercises keyboard, reconnect, and WebGL fallback flows, and regenerates Phase 03 screenshots, an interaction recording, and engine receipts in `docs/evidence/phase-03/`. If Chromium is already installed elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. Browser traces and incidental test output go to ignored `test-results/`.

Regenerate deterministic branch logs and the machine-readable rule-review status with:

```bash
npm run evidence:phase03
```

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` only when running real probes. Missing configuration returns an actionable HTTP 503 or command-line error. Never put this key in a `VITE_` variable; Vite exposes those variables to browser code.

## Develop

Run the API and Vite development server in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Open `http://127.0.0.1:5173`. The browser calls the local server through Vite's `/api` proxy. Defaults and optional environment overrides are documented in `.env.example` and [the provider notes](docs/provider-integrations.md).

## Production build

```bash
npm run build
npm start
```

Open `http://127.0.0.1:3000`. The Node server serves the built browser application and API.

## Real API proofs

With `OPENAI_API_KEY` configured on the server:

```bash
npm run probe:examiner
```

This starts one real managed Agents API session, handles its application function request, and writes a sanitized receipt under `docs/evidence/`. For the Live proof, start both development processes, open `/probe`, grant microphone permission, and follow the interruption check shown beside the controls. The deterministic bedside does not itself satisfy either real-provider gate.
