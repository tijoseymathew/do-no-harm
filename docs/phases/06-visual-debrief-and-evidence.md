# Phase 06 — Visual debrief, evidence replay, and formative assessment

Status: Blocked — implementation and software verification pass; dependency completion and a real Astra feedback envelope remain pending.

Dependencies: Phases 03, 04, and 05.

Specification: [specs.md](../../specs.md), sections 7, 8, 9.

## Outcome

Every run ends with a consistent evidence cutoff and a visual account of what the student assessed, administered, observed, and explained.

## Implementation checklist

- [x] Implement Finish sequencing: freeze simulation, settle accepted actions, save notes, flush available transcript with bounded timeout, and name the evidence cutoff.
- [x] Generate the six criterion outcomes, one strength, one improvement, and one next-practice objective with schema-validated evidence references.
- [x] Build vital-sign trend charts with treatment/alarm/escalation markers and a chronological action list.
- [x] Link evidence cards to exact note revisions, findings, transcript segments, and medication receipts.
- [x] Add spoken debrief, optional assisted teach-back, run JSON export, and feedback revision handling for late corrections.
- [x] Handle evaluation failure with retained evidence and retry; display technical gaps as insufficient evidence where relevant.

## Verification checklist

- [x] V01: Finish while a note edit, transcript segment, and accepted command are pending; feedback uses the documented cutoff without silently dropping accepted actions.
- [x] V02: For each of the three scenario paths, open every feedback citation and confirm it resolves to the exact evidence shown.
- [x] V03: Compare chart markers with administration receipts and simulation times; prepared/blocked actions never appear as administered doses.
- [x] V04: Run an incomplete case: unsupported criteria return insufficient_evidence rather than invented observations or quotations.
- [x] V05: Submit a deliberately invalid evidence reference in an evaluator fixture; validation prevents publication and exposes a recoverable error.
- [x] V06: Apply a late transcript correction and regenerate feedback: preserve the original cutoff/version and label the new revision.
- [x] V07: Force evaluator failure, retry, and confirm the run remains intact; mark teach-back evidence assisted.

## Evidence and completion

Retain: Three debrief run exports, screenshots of trend/evidence views, citation-validation results, and cutoff/failure test results.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux ARM64; Node.js 24.15.0; npm 11.12.1; Chromium 151.0.7922.34 with SwiftShader software WebGL; Vitest 5.0.0; Playwright 1.63.0.
- Commands / manual steps: `npm run verify` passed strict client/server type checks, 48 unit/API/component tests across 7 files, both production builds, and the client-boundary scan. `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/josey/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell npm run test:browser` passed all 12 browser tests. `npm run evidence:phase06` generated and internally citation-checked three path exports plus cutoff/failure evidence. The debrief and evidence screenshots were visually inspected. After correcting the Agents SDK tool-result boundary to return evidence inside a JSON object, `npm run verify:phase06:real` passed with a complete six-criterion Astra feedback envelope and fully resolved citations.
- Results / artifact locations: Finish concurrency, exact-citation, marker/receipt, incomplete-evidence, invalid-reference, late-revision, failure/retry, and assisted teach-back assertions are in [`server/debrief-service.test.ts`](../../server/debrief-service.test.ts) and [`server/conversation-service.test.ts`](../../server/conversation-service.test.ts). Browser coverage is in [`tests/browser/phase06.spec.ts`](../../tests/browser/phase06.spec.ts). Reproducible debrief exports are [timely care](../evidence/phase-06/timely-care.json), [delayed care](../evidence/phase-06/delayed-care.json), and [inappropriate attempt](../evidence/phase-06/inappropriate-attempt.json); invalid-reference and retained-failure results are in [cutoff/failure validation](../evidence/phase-06/cutoff-failure-validation.json), and the real-provider result is in the [sanitized Astra receipt](../evidence/phase-06/real-debrief-checkpoint.json). Visual evidence is in the [debrief view](../evidence/phase-06/debrief-view-1280x900.png) and [exact evidence view](../evidence/phase-06/evidence-view-1280x900.png).
- V01/V06: The run queue settles an already accepted assessment before the final note and buffered speech segment. `session.ended` is the last event in `finish-v1`; a late transcript correction remains append-only and regeneration preserves feedback revision 1 while naming and labeling revision 2.
- V02/V05: Export generation checks every criterion and summary citation in all three paths against its visible evidence-card set. A deliberately invented UUID is rejected before any `feedback.published` event.
- V03/V04: A medication treatment marker's event ID exactly equals its accepted administration receipt ID; prepared and blocked events remain distinct action statuses and create no dose marker. In an incomplete run, assessment, interpretation, intervention, and reassessment all return `insufficient_evidence` without invented findings or quotations.
- V07: A provider fixture fails once, leaves its cutoff and evidence intact, then succeeds on retry against that same cutoff. Teach-back prompts and the following answer are marked assisted. The browser receives the frozen reconstruction before evaluation completes and polls without blocking Finish on provider latency.
- Remaining blockers: Phases 03–05 remain blocked by qualified clinical review (and Phase 05's microphone-specific checks), so this dependent phase cannot be marked Complete. The known Three.js client chunk warning remains non-fatal.
