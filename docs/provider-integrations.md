# Provider integrations

Contract review date: 13 September 2026.

These are deliberately separate proofs. Both use the server-only `OPENAI_API_KEY`; neither exposes it through browser configuration, health output, case output, or retained evidence.

## Pinned packages

| Package | Version | Purpose |
|---|---:|---|
| Node.js | `>=22.6.0` | Minimum runtime required by the official GPT-Live Node WebRTC example |
| TypeScript | `7.0.2` | Shared strict contracts and separate browser/server checks |
| React / React DOM | `19.3.0` | Browser probe |
| Vite / React plugin | `8.3.0` / `6.1.1` | Browser development and production build |
| Express | `5.2.1` | Trusted application server |
| OpenAI JavaScript SDK | `7.15.0` | Live and managed Agents API clients |
| Zod | `4.6.4` | Runtime contract validation |
| Vitest | `5.0.0` | Contract and API-boundary verification |

Versions are exact in `package.json` and `package-lock.json`; update this table in the same change as a dependency upgrade.

## GPT-Live browser probe

The browser obtains microphone audio only after the learner selects **Start conversation**. It creates an `RTCPeerConnection`, adds the microphone track, creates the `oai-events` data channel, makes an SDP offer, and posts only that offer to `POST /api/live/session`.

The application server validates the request origin and SDP, then uses the project credential to create a `gpt-live-1` session with client delegation and WebRTC transport. It returns the typed session ID and SDP answer. The browser waits for `session.started`, carries audio on media tracks, and uses `session.close` / `session.closed` for graceful shutdown. Speaking while Patient is replying is the manual full-duplex interruption test.

This follows the official [GPT-Live overview](https://developers.openai.com/api/docs/guides/live) and [GPT-Live WebRTC contract](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live). The official guide requires a trusted server to exchange browser SDP at `/v1/live/sessions` and says to keep the project key and session configuration there.

Run it:

```bash
npm run dev:server
npm run dev:client
```

Then open `http://127.0.0.1:5173`, start the conversation, hear a spoken response, interrupt it naturally, and close the session. A pass requires observed audio and interruption; `session.started` alone is insufficient.

## Astra examiner probe

`npm run probe:examiner` starts one real managed Agents API session using `gpt-6-astra`, `environment: { type: "none" }`, and a `get_visible_state` application function. The probe:

1. waits for `agent.session.requires_action`;
2. verifies that the pending action is `get_visible_state`;
3. submits `agent.session.input.tool_result` with the original turn and call identifiers;
4. waits for session completion; and
5. requires exactly one handled application function before writing a sanitized receipt.

The official [Agents API session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) defines managed, asynchronous session turns. The official [function guide](https://developers.openai.com/api/docs/guides/agents-api/tools/functions) says pending calls come from `required_actions` and results return as `agent.session.input.tool_result`; this implementation does not substitute a Responses SDK call for that flow.

The key needs `api.agents.read`, `api.agents.write`, and `api.responses.write`, as listed in the official [Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart). Model availability remains project-specific.

Receipts contain no credential or hidden reasoning. They retain provider/mode labels, masked session and call identifiers, event types, application tool arguments/results, final output text, and timestamps.

## Configuration and failure behavior

`.env.example` is value-free. Blank optional settings use these defaults:

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `APP_ORIGIN` | localhost and `127.0.0.1` on ports `5173` and `3000` |
| `OPENAI_LIVE_MODEL` | `gpt-live-1` |
| `OPENAI_EXAMINER_MODEL` | `gpt-6-astra` |

`GET /api/health` returns case version, clinical review status, configured booleans, explicit `mode: "real"` labels, and model names. It never returns a credential. Missing provider configuration is an unavailable/blocked state, not a mock success. Provider API errors are reduced to status and request ID; response bodies and request credentials are not logged.
