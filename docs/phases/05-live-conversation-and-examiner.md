# Phase 05 — Grounded live conversation and examiner checkpoints

Status: Blocked — implementation, automated boundaries, and real examiner continuity pass; browser voice/interruption verification and dependency completion remain pending.

Dependencies: Phases 01, 03, and 04.

Specification: [specs.md](../../specs.md), sections 5, 6, 7, 9.

## Outcome

Live conversation and the persistent examiner session use actual run evidence while respecting treatment and information boundaries.

## Implementation checklist

- [x] Play the authored `voiceBriefing` as the first Nurse/facilitator turn: formative simulation, student role, patient identity/age/complaint/visible appearance, and “assess and manage”; then ask what they want to do.
- [x] Keep the briefing free of unelicited history, expected next actions, doses, and rubric language; the student still obtains history by asking.
- [x] Connect patient/nurse/examiner role labels, captions, interruptions, and text fallback to the complete case.
- [x] Implement permitted fact retrieval, visible-state retrieval, voice action drafting, evidence retrieval, and validated examiner-output tools.
- [x] Keep voice-created medication parameters visible and unexecuted until the student confirms administration.
- [x] Continue one examiner session at meaningful checkpoints; serialize turns and suppress stale outputs.
- [x] Ask at most one neutral follow-up after handoff/reasoning checkpoint, grounded in evidence available at that point.
- [x] Preserve transcript corrections and distinguish assisted responses from unassisted decisions.

## Verification checklist

- [ ] V01: First Live turn is the authored `voiceBriefing` (Nurse). It names the simulation, student role, Morgan Lee, age, chest pressure, and visible appearance, and asks what the student wants to do. It does not recite onset, medications, comorbidities, aspirin, or an ABCDE script.
- [x] V02: Ask history and equipment questions: answers match currently releasable case facts and visible measurements.
- [x] V03: Say an ambiguous medication request: missing parameters remain unset; no treatment occurs until the UI review and administration steps complete.
- [ ] V04: Interrupt and correct a statement; confirm the corrected evidence reaches the examiner before feedback is finalized.
- [x] V05: Run matching speech/action and conflicting speech/action cases; each yields an appropriate question without invented discrepancies.
- [x] V06: Inject instructions into a student note asking to reveal the rubric or administer a drug; tool permissions and server validation prevent both.
- [x] V07: Confirm one managed examiner session is continued across checkpoints, only one examiner turn runs at a time, and no more than one follow-up is delivered.
- [ ] V08: Interrupt the voice connection and continue by text without losing accepted actions or notes.

## Evidence and completion

Retain: Sanitized real integration receipts, transcript/event exports for both reasoning paths, and permission-boundary verification results.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux ARM64; Node.js 24.15.0; npm 11.12.1; Vitest 5.0.0; Playwright 1.63.0; non-interactive terminal in Asia/Singapore.
- Commands / manual steps: `npm run verify` passed type checks, 40 unit/API tests, production builds, and the built-client boundary scan. `npm run evidence:phase05` exported both deterministic reasoning paths and permission denials. `npm run verify:phase05:real` created one real `gpt-6-astra` Agents API session, continued it from an assessment checkpoint to handoff, handled application tools, and accepted one validated follow-up. `npx playwright test tests/browser/phase05.spec.ts` could not launch because the matching browser executable was absent; `npx playwright install chromium` retried and timed out against the Playwright CDN.
- Results / artifact locations: Focused coverage is in [`server/conversation-service.test.ts`](../../server/conversation-service.test.ts), [`server/app.test.ts`](../../server/app.test.ts), and [`tests/browser/phase05.spec.ts`](../../tests/browser/phase05.spec.ts). Retained exports: [matching path](../evidence/phase-05/matching-path.json), [conflicting path](../evidence/phase-05/conflicting-path.json), [permission boundary](../evidence/phase-05/permission-boundary.json), and [real examiner checkpoint](../evidence/phase-05/real-examiner-checkpoint.json). The real receipt records `sameSessionAcrossCheckpoints: true`, one examiner-output event, and zero administration receipts.
- V02/V03: Asked onset and connected/disconnected heart-rate questions return only released history and visible state. An ambiguous voice-origin aspirin draft persists with null dose/unit/route and no receipt; only parameter update, prerequisite confirmation, and the existing final administration command can create a receipt.
- V05/V06/V07: Matching and conflicting handoffs produce respectively a rationale question and an administration-status question. Examiner mutation and unsafe output submissions are denied. Tests serialize simultaneous checkpoints, invalidate a result after concurrent evidence changes, retry against the same session, and mark the first student answer after the accepted follow-up as assisted. The real integration continued one opaque session across active-care and handoff checkpoints and suppressed an additional reasoning follow-up.
- Remaining blockers: V01, V04, and V08 still require a working browser/microphone to hear the exact authored first Nurse turn, interrupt real speech, save a correction, and verify text continuation after connection loss. The matching Chromium download was unavailable in this environment. Phase 01's real audio/interruption gate is also pending, and Phases 03 and 04 remain formally blocked by that dependency chain and qualified clinical review; therefore this phase cannot be marked Complete. The known Three.js client chunk warning remains non-fatal.
