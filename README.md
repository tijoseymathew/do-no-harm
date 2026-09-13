# DO NO HARM

An interactive emergency-room simulation for medical students: assess a fictional patient, operate bedside equipment, choose medication doses, administer treatment, reassess, and receive a visual evidence-linked debrief.

Phase 01 provides the application skeleton, versioned case contracts, an unreviewed fictional chest-pain draft, and independently runnable real-provider probes.

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

This starts one real managed Agents API session, handles its application function request, and writes a sanitized receipt under `docs/evidence/`. For the Live proof, start both development processes, open the page, grant microphone permission, and follow the interruption check shown beside the controls. A fixture or mocked request is deliberately not offered as a substitute for either real gate.
