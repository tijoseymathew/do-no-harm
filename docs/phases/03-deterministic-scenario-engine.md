# Phase 03 — Deterministic scenario engine and treatment rules

Status: Blocked — implementation and software verification pass; qualified clinical review and the Phase 01/02 dependency chain remain pending.

Dependencies: Phase 01; integrate with the Phase 02 room before closing this phase.

Specification: [specs.md](../../specs.md), sections 3, 4, 7, 10.

## Outcome

Patient physiology, observations, treatments, and timers are driven by reproducible server rules and reflected consistently in the room.

## Implementation checklist

- [x] Implement the authoritative simulation clock, state revisions, serialized commands, and append-only events.
- [x] Separate physiology, connected sensor readings, intermittent measurements, device settings, and session lifecycle.
- [x] Implement timely-care, delayed-care, and inappropriate-attempt branches with explicit entry/exit conditions and bounded timeouts.
- [x] Implement dose/unit validation, cumulative-dose limits, repeat intervals, access/authorization prerequisites, delayed effects, and fluid delivery accounting.
- [x] Add idempotency, stale-command rejection, and causation links; drive monitor snapshots from the engine.
- [ ] Obtain and record review of the case rules used in clinical demonstrations. Unreviewed rules remain development fixtures and cannot establish clinical acceptance.

## Verification checklist

- [x] V01: Replay identical commands at identical simulation times twice and compare clinical/device state and ordered clinical events, ignoring wall-clock IDs.
- [x] V02: Exercise all three branches from fresh state and assert the specified entry conditions, observations, receipts, and exit conditions.
- [x] V03: Pause during a pending effect and fluid delivery: simulated time, waveforms, effect timers, and delivered volume all stop; resume consistently.
- [x] V04: Test valid unit conversions and reject malformed/missing units, nonpositive quantities, excessive cumulative doses, and premature repeat doses.
- [x] V05: Resend the same administration command and simulate double clicks: exactly one dose and one accepted administration result exist.
- [x] V06: Attempt stale commands and unauthorized actions; confirm no mutation occurs and explicit rejection evidence is recorded.
- [x] V07: Confirm the monitor tracks state changes without exposing disconnected readings or refreshing intermittent BP automatically.
- [x] V08: Inspect case review records: every enabled clinical effect/dose rule has a source, revision, and review result.

## Evidence and completion

Retain: Focused engine test results, reproducible branch event logs, monitor integration recording, and clinical rule review records.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux ARM64; Node.js 24.15.0; npm 11.12.1; Chromium 151.0.7922.34 with SwiftShader software WebGL; Vitest 5.0.0; Playwright 1.63.0.
- Commands / manual steps: `npm run verify` passed type checks, 24 tests across 5 files, both production builds, and the client-boundary scan. `npm run evidence:phase03` generated the branch/review artifacts; running it twice and checking SHA-256 sums produced identical files. `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/josey/.cache/ms-playwright/chromium-1234/chrome-linux/chrome npm run test:browser` passed all 7 browser tests. Inspected the accepted-receipt screenshots at both target resolutions.
- Results / artifact locations: Focused coverage is in [`server/scenario-engine.test.ts`](../../server/scenario-engine.test.ts) and [`server/scenario.test.ts`](../../server/scenario.test.ts). Reproducible runs for all paths are in [branch replay](../evidence/phase-03/branch-replay.json); source/revision/result inventory is in [clinical rule review](../evidence/phase-03/clinical-rule-review.json). Room integration evidence includes [1440×900](../evidence/phase-03/accepted-1440x900.png), [1280×720](../evidence/phase-03/accepted-1280x720.png), [interaction recording](../evidence/phase-03/interaction-1280x720.webm), and administration receipts for [1440](../evidence/phase-03/receipt-1440.json) / [1280](../evidence/phase-03/receipt-1280.json).
- V01/V02: Identical command/time sequences reproduce clinical/device state and ordered event projections. Fresh runs cover timely completion after the delayed effect and senior acknowledgment, delayed deterioration and recovery conditions, inappropriate-attempt correction, and bounded timeout behavior.
- V03/V04: A paused run rejects time advancement and leaves simulation time, pending effects, monitor sources, and delivered volume frozen; resume reaches the same scheduled effect and volume. Tests cover `0.3 g → 300 mg`, null/unsupported units, nonpositive values, exact-dose rules, cumulative limits, repeat intervals, IV access, and senior authorization.
- V05/V06/V07: Engine and concurrent API tests prove retry/double-click deduplication, command serialization, stale-revision rejection evidence, and no unauthorized treatment/device mutation. Connected HR/SpO₂ follow underlying deterioration; disconnected readings remain unavailable; the original BP stays timestamped until a new measurement.
- V08 / review result: The case, progression, aspirin effect marker, and IV-fluid rules all record source title/URL, source revision, and `draft_unreviewed`. The server therefore marks every run `development_fixture`, and the browser labels this status. This verifies review metadata and containment only; it is not clinical review.
- Remaining blockers: An appropriately qualified reviewer must complete [`docs/clinical-review-checklist.md`](../clinical-review-checklist.md), name the local protocol/revision, resolve the listed clinical parameters, and sign the complete case before the final implementation item or clinical acceptance can pass. Phase 01 V04 still needs the human-observed live microphone/response/interruption check; Phase 02 is consequently blocked on that dependency, so Phase 03 cannot be marked Complete even though its own software and room-integration checks pass. The Vite build retains the expected Three.js chunk-size warning (~875 kB uncompressed); this did not fail the build or browser checks.

## Engine boundary and handoff

`POST /api/runs` creates an isolated in-memory engine; `GET /api/runs/:id` resynchronizes visible state; `POST /api/runs/:id/commands` accepts a revision, UUID idempotency key, and validated command; `GET /api/runs/:id/events` exposes the ordered run evidence for later debrief work. `/api/fixtures` remains a temporary compatibility alias. Each run appends its case snapshot, events, and state snapshots to ignored `runs/<run-id>.jsonl`; deployment-restart recovery remains outside this phase.

Simulation time advances only through accepted engine commands. Browser animation interpolates from the timestamped state and freezes while the server clock is paused or synchronization is lost. Treatment effects, senior acknowledgment, branch transitions, and fluid volume all use the same clock. The monitor derives connected live values from physiology while preserving intermittent BP independently.

Case version `1.0.0-draft.2` contains exact normalized-dose rules, generic repeat/cumulative/access/authorization enforcement, a delayed aspirin action marker with no vital-sign change, bounded timely/delayed/inappropriate branches, and a fluid-accounting rule with no physiological effect. These values are software fixtures and remain excluded from clinical demonstrations until review is recorded.
