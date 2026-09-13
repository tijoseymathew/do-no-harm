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

Then open `http://127.0.0.1:5173/probe`, start the conversation, hear a spoken response, interrupt it naturally, and close the session. A pass requires observed audio and interruption; `session.started` alone is insufficient.

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

## Grounded bedside integration

The complete bedside uses the same provider contracts behind application-owned boundaries. `POST /api/live/session` binds the returned Live session ID to one run and limits the untrusted WebRTC data channel to audio controls, authored commentary, transcript/status events, and graceful close. Live tool routes require that matching run/session binding and expose only `get_case_fact`, `get_visible_state`, and `prepare_action`; they cannot administer treatment. The first visible transcript entry and first requested spoken commentary are the case pack's exact `voiceBriefing`.

Each voice/text medication request creates an authoritative prepared order with its origin and any missing dose, unit, or route left as `null`. Updating those fields still does not administer it. The normal medication checks and `administer_prepared` command remain the only path to a receipt and authored effect.

The examiner receives only `get_evidence` and `submit_examiner_output`. The server fixes an evidence sequence cutoff, validates every submitted evidence ID and the single neutral question, rejects rubric/treatment instructions, serializes checkpoint turns, and suppresses output if evidence changes while a turn is running. Assessment/treatment checkpoints continue the managed session without interrupting the learner; handoff/reasoning may deliver at most one follow-up. A provider turn that returns plain text without the required output tool gets one serialized repair request on the same session; unvalidated text is never shown.

Run `npm run evidence:phase05` for deterministic boundary exports and `npm run verify:phase05:real` for the sanitized real-session receipt. The latter proves that one managed Astra session continues from an active-care checkpoint to handoff; it requires the same Agents API permissions as the probe.

## Visual debrief checkpoint

Finish freezes the server clock, serially settles commands already accepted by the run queue, saves the current note draft, and drains the browser's available transcript buffer for up to 750 ms. The resulting `session.ended` event names `finish-v1` and is the immutable basis for the first debrief. The browser receives the reconstruction immediately and polls while the managed examiner runs, so provider latency does not hold open the Finish request.

The debrief turn reads evidence only through that named sequence and can publish only a schema-valid `feedback` output containing the six rubric criteria plus cited strength and improvement summaries. Every cited UUID must resolve to an event inside the cutoff. A failure publishes no feedback: the evidence, chart, actions, and cutoff remain available with an **Evaluation unavailable** state and retry control. A correction after Finish is append-only; retry names a new late-evidence cutoff and preserves the first feedback revision.

`npm run evidence:phase06` produces deterministic three-path exports and cutoff/failure validation evidence. `npm run verify:phase06:real` exercises the same contract with the configured Astra Agents API provider and writes a sanitized receipt only on success. The retained real Phase 06 receipt subsequently reached `ready`, with all six criteria and all citations resolved. Earlier failures remain a useful recovery test, not the current integration status. See `docs/evidence/phase-06/real-debrief-checkpoint.json` for the timestamped verification.

## Configuration and failure behavior

`.env.example` is value-free. Blank optional settings use these defaults:

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `APP_ORIGIN` | localhost and `127.0.0.1` on ports `5173` and `3000` |
| `OPENAI_LIVE_MODEL` | `gpt-live-1` |
| `OPENAI_EXAMINER_MODEL` | `gpt-6-astra` |

`GET /api/health` returns case version, clinical review status, configured booleans, explicit `mode: "real"` labels, and model names. It never returns a credential. Missing provider configuration is an unavailable/blocked state, not a mock success. Provider API errors are reduced to status and request ID; response bodies and request credentials are not logged.

## Submission reliability review

The browser now handles `session.delegation.created` metadata and returns the server-grounded transcript result with the original opaque delegation ID. Input and output captions are separate; repeated delegation events are deduplicated and obsolete results are suppressed after newer input or disconnect. Microphone mute has a matching unmute; interruption uses natural speech rather than an input-mute command. Disconnect sends `session.close`, stops media tracks, and releases the application binding.

Examiner checkpoint requests have a 120-second browser window instead of the ordinary 10-second API timeout. The reasoning checkpoint holds simulation advances while reviewing to avoid making its own evidence stale. Debrief remains asynchronous and polled. The browser voice test simulates WebRTC events; it is not a real audio/interruption proof.
