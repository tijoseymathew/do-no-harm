# Phase 05 — Grounded live conversation and examiner checkpoints

Status: Not started.

Dependencies: Phases 01, 03, and 04.

Specification: [specs.md](../../specs.md), sections 5, 6, 7, 9.

## Outcome

Live conversation and the persistent examiner session use actual run evidence while respecting treatment and information boundaries.

## Implementation checklist

- [ ] Play the authored `voiceBriefing` as the first Nurse/facilitator turn: formative simulation, student role, patient identity/age/complaint/visible appearance, and “assess and manage”; then ask what they want to do.
- [ ] Keep the briefing free of unelicited history, expected next actions, doses, and rubric language; the student still obtains history by asking.
- [ ] Connect patient/nurse/examiner role labels, captions, interruptions, and text fallback to the complete case.
- [ ] Implement permitted fact retrieval, visible-state retrieval, voice action drafting, evidence retrieval, and validated examiner-output tools.
- [ ] Keep voice-created medication parameters visible and unexecuted until the student confirms administration.
- [ ] Continue one examiner session at meaningful checkpoints; serialize turns and suppress stale outputs.
- [ ] Ask at most one neutral follow-up after handoff/reasoning checkpoint, grounded in evidence available at that point.
- [ ] Preserve transcript corrections and distinguish assisted responses from unassisted decisions.

## Verification checklist

- [ ] V01: First Live turn is the authored `voiceBriefing` (Nurse). It names the simulation, student role, Morgan Lee, age, chest pressure, and visible appearance, and asks what the student wants to do. It does not recite onset, medications, comorbidities, aspirin, or an ABCDE script.
- [ ] V02: Ask history and equipment questions: answers match currently releasable case facts and visible measurements.
- [ ] V03: Say an ambiguous medication request: missing parameters remain unset; no treatment occurs until the UI review and administration steps complete.
- [ ] V04: Interrupt and correct a statement; confirm the corrected evidence reaches the examiner before feedback is finalized.
- [ ] V05: Run matching speech/action and conflicting speech/action cases; each yields an appropriate question without invented discrepancies.
- [ ] V06: Inject instructions into a student note asking to reveal the rubric or administer a drug; tool permissions and server validation prevent both.
- [ ] V07: Confirm one managed examiner session is continued across checkpoints, only one examiner turn runs at a time, and no more than one follow-up is delivered.
- [ ] V08: Interrupt the voice connection and continue by text without losing accepted actions or notes.

## Evidence and completion

Retain: Sanitized real integration receipts, transcript/event exports for both reasoning paths, and permission-boundary verification results.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
