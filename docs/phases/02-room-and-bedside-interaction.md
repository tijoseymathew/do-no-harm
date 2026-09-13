# Phase 02 — Visual room and bedside interaction slice

Status: Not started.

Dependencies: Phase 01.

Specification: [specs.md](../../specs.md), sections 2, 4, 9, 10.

## Outcome

A student can use the room to connect monitoring and complete a medication interaction against an explicitly labeled fixture-backed server.

## Implementation checklist

- [ ] Build the fixed-camera emergency bay, patient, monitor, oxygen/IV stations, trolley, ECG workstation, clipboard, and call station.
- [ ] Implement focus transitions and accessible HTML controls mirroring every active hotspot; label unavailable equipment.
- [ ] Render ECG/pleth traces and numeric measurements from a shared fixture state, including sensor status and BP measurement age.
- [ ] Implement a medication panel with drug/formulation, dose, unit, route, review summary, and explicit Administer control.
- [ ] Return a server-accepted administration receipt and update visible equipment state. Keep physiology labeled as fixture-driven until Phase 03.
- [ ] Add captions space, keyboard focus, reduced motion, audio mute, and responsive panel layout.

## Verification checklist

- [ ] V01: At 1440×900 and 1280×720, inspect the room and open every implemented object without obscuring primary controls or monitor summary.
- [ ] V02: Connect/disconnect sensors: unavailable values are labeled, connected values appear, and the rhythm timing matches displayed HR.
- [ ] V03: Measure BP, advance fixture time, and confirm measurement age changes until a repeat measurement updates it.
- [ ] V04: Enter a dose and route, review, cancel, and retry; only Administer produces an administration receipt.
- [ ] V05: Complete the sensor and medication flow with keyboard controls; repeat with reduced motion and muted sound.
- [ ] V06: Disable WebGL and confirm functional HTML controls remain available with a reduced-graphics message.

## Evidence and completion

Retain: Screenshots at both viewport sizes, a short interaction recording, and receipts from the fixture-backed flow. These do not establish clinical behavior or full integration.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
