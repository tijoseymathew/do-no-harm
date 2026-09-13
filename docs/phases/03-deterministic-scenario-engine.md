# Phase 03 — Deterministic scenario engine and treatment rules

Status: Not started.

Dependencies: Phase 01; integrate with the Phase 02 room before closing this phase.

Specification: [specs.md](../../specs.md), sections 3, 4, 7, 10.

## Outcome

Patient physiology, observations, treatments, and timers are driven by reproducible server rules and reflected consistently in the room.

## Implementation checklist

- [ ] Implement the authoritative simulation clock, state revisions, serialized commands, and append-only events.
- [ ] Separate physiology, connected sensor readings, intermittent measurements, device settings, and session lifecycle.
- [ ] Implement timely-care, delayed-care, and inappropriate-attempt branches with explicit entry/exit conditions and bounded timeouts.
- [ ] Implement dose/unit validation, cumulative-dose limits, repeat intervals, access/authorization prerequisites, delayed effects, and fluid delivery accounting.
- [ ] Add idempotency, stale-command rejection, and causation links; drive monitor snapshots from the engine.
- [ ] Obtain and record review of the case rules used in clinical demonstrations. Unreviewed rules remain development fixtures and cannot establish clinical acceptance.

## Verification checklist

- [ ] V01: Replay identical commands at identical simulation times twice and compare clinical/device state and ordered clinical events, ignoring wall-clock IDs.
- [ ] V02: Exercise all three branches from fresh state and assert the specified entry conditions, observations, receipts, and exit conditions.
- [ ] V03: Pause during a pending effect and fluid delivery: simulated time, waveforms, effect timers, and delivered volume all stop; resume consistently.
- [ ] V04: Test valid unit conversions and reject malformed/missing units, nonpositive quantities, excessive cumulative doses, and premature repeat doses.
- [ ] V05: Resend the same administration command and simulate double clicks: exactly one dose and one accepted administration result exist.
- [ ] V06: Attempt stale commands and unauthorized actions; confirm no mutation occurs and explicit rejection evidence is recorded.
- [ ] V07: Confirm the monitor tracks state changes without exposing disconnected readings or refreshing intermittent BP automatically.
- [ ] V08: Inspect case review records: every enabled clinical effect/dose rule has a source, revision, and review result.

## Evidence and completion

Retain: Focused engine test results, reproducible branch event logs, monitor integration recording, and clinical rule review records.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
