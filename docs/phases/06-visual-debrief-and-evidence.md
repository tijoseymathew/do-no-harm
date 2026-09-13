# Phase 06 — Visual debrief, evidence replay, and formative assessment

Status: Not started.

Dependencies: Phases 03, 04, and 05.

Specification: [specs.md](../../specs.md), sections 7, 8, 9.

## Outcome

Every run ends with a consistent evidence cutoff and a visual account of what the student assessed, administered, observed, and explained.

## Implementation checklist

- [ ] Implement Finish sequencing: freeze simulation, settle accepted actions, save notes, flush available transcript with bounded timeout, and name the evidence cutoff.
- [ ] Generate the six criterion outcomes, one strength, one improvement, and one next-practice objective with schema-validated evidence references.
- [ ] Build vital-sign trend charts with treatment/alarm/escalation markers and a chronological action list.
- [ ] Link evidence cards to exact note revisions, findings, transcript segments, and medication receipts.
- [ ] Add spoken debrief, optional assisted teach-back, run JSON export, and feedback revision handling for late corrections.
- [ ] Handle evaluation failure with retained evidence and retry; display technical gaps as insufficient evidence where relevant.

## Verification checklist

- [ ] V01: Finish while a note edit, transcript segment, and accepted command are pending; feedback uses the documented cutoff without silently dropping accepted actions.
- [ ] V02: For each of the three scenario paths, open every feedback citation and confirm it resolves to the exact evidence shown.
- [ ] V03: Compare chart markers with administration receipts and simulation times; prepared/blocked actions never appear as administered doses.
- [ ] V04: Run an incomplete case: unsupported criteria return insufficient_evidence rather than invented observations or quotations.
- [ ] V05: Submit a deliberately invalid evidence reference in an evaluator fixture; validation prevents publication and exposes a recoverable error.
- [ ] V06: Apply a late transcript correction and regenerate feedback: preserve the original cutoff/version and label the new revision.
- [ ] V07: Force evaluator failure, retry, and confirm the run remains intact; mark teach-back evidence assisted.

## Evidence and completion

Retain: Three debrief run exports, screenshots of trend/evidence views, citation-validation results, and cutoff/failure test results.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
