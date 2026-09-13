# Phase 04 — Complete assessment, treatment, and handoff workflow

Status: Not started.

Dependencies: Phases 02 and 03.

Specification: [specs.md](../../specs.md), sections 3, 4, 7, 10.

## Outcome

One complete student run can be performed through room and HTML controls, using text before full voice orchestration.

## Implementation checklist

- [ ] Expose focused patient history and examination findings with availability rules.
- [ ] Implement ECG acquisition, reviewed 12-lead artwork with calibration/lead labels, zoom, report access, and student interpretation.
- [ ] Implement case-specific labs with requested, collected, pending, available, and displayed states.
- [ ] Complete oxygen device/setting controls and IV access, patency, fluid volume/rate, start/stop, and cumulative delivery.
- [ ] Complete the reviewed case formulary with allergy/history checks, treatment status history, and explicit simulated authorization.
- [ ] Implement saved note revisions, senior request/acknowledgment, text handoff, and an explicit Finish action.

## Verification checklist

- [ ] V01: Run arrival → assessment → ECG → medication administration → reassessment → handoff → Finish without editing server state.
- [ ] V02: Attempt an investigation before its acquisition delay expires; no result is revealed. Open it later and verify distinct request/availability/display events.
- [ ] V03: Apply, adjust, and stop supported oxygen/IV settings; confirm equipment state and delivery totals match events.
- [ ] V04: Prepare but do not administer a medication; confirm no dose/effect is applied. Complete a supported administration and a blocked inappropriate attempt.
- [ ] V05: Perform an acceptable alternative action sequence and reassess more than once; the workflow permits both.
- [ ] V06: Save and revise notes, request supervised action, and give a handoff; verify notes, authorization, and actual action statuses remain distinct.
- [ ] V07: Ask for an unsupported test or drug; the application reports its case limitation without inventing findings.

## Evidence and completion

Retain: A complete text-controlled run export, ECG/content review record, and recordings of normal and blocked-action flows.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
