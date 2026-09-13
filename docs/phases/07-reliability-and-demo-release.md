# Phase 07 — Reliability, polish, and presentation readiness

Status: Not started.

Dependencies: Phases 01–06.

Specification: [specs.md](../../specs.md), sections 2, 9, 10, 11.

## Outcome

A clean checkout can produce a reliable, visually complete demonstration with recovery controls and inspectable integration evidence.

## Implementation checklist

- [ ] Implement presenter reset, pause/resume, explicit time compression, and pre-run branch selection; record presenter interventions.
- [ ] Complete synchronization-loss pause, reconnect/resync, stale measurement labels, and reset isolation across provider sessions.
- [ ] Polish lighting, equipment feedback, patient motion, alarm acknowledgment, accessible controls, and viewport behavior.
- [ ] Document deployment, supported presentation browser/hardware, setup, health checks, recovery, and run export.
- [ ] Prepare the three-minute script, a real recorded backup, and a presenter-only sanitized integration view.
- [ ] Collect all phase evidence and complete the final clinical/content and product acceptance review.

## Verification checklist

- [ ] V01: Install and build from a clean checkout using the README; start the deployed app and complete a real integrated run.
- [ ] V02: Rehearse timely, delayed, inappropriate-attempt, and incomplete runs from reset; each reaches a valid debrief.
- [ ] V03: Lose server synchronization during a treatment: simulation pauses, stale data is labeled, and reconnect restores state without duplicate treatment.
- [ ] V04: Reset after a partially completed run: doses, devices, clocks, notes, transcript, evidence, and provider sessions do not leak into the next run.
- [ ] V05: Acknowledge an active alarm: audio is temporarily silenced while the visible condition remains until resolved.
- [ ] V06: Measure command acknowledgment on the presentation deployment against the 300 ms target under normal conditions; inspect smooth room/waveforms and record hardware/browser.
- [ ] V07: Complete keyboard, muted-audio, reduced-motion, 1280×720, and WebGL-fallback checks; the normal presentation still uses the 3D room.
- [ ] V08: Time the three-minute presentation, label time compression, verify real session/tool receipts, and play the recorded backup.
- [ ] V09: Confirm every enabled clinical rule is reviewed and no phase gate is unchecked; document any unmet gate as a release blocker.

## Evidence and completion

Retain: Final acceptance checklist, clean-setup log, recovery/performance results, rehearsed script, real backup recording, and sanitized run evidence.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
