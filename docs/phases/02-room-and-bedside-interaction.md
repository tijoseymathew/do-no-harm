# Phase 02 — Visual room and bedside interaction slice

Status: Blocked — implementation and Phase 02 verification pass; Phase 01's browser audio gate remains pending.

Dependencies: Phase 01.

Specification: [specs.md](../../specs.md), sections 2, 4, 9, 10.

## Outcome

A student can use the room to connect monitoring and complete a medication interaction against an explicitly labeled fixture-backed server.

## Implementation checklist

- [x] Build the fixed-camera emergency bay, patient, monitor, oxygen/IV stations, trolley, ECG workstation, clipboard, and call station.
- [x] Implement focus transitions and accessible HTML controls mirroring every active hotspot; label unavailable equipment.
- [x] Render ECG/pleth traces and numeric measurements from a shared fixture state, including sensor status and BP measurement age.
- [x] Implement a medication panel with drug/formulation, dose, unit, route, review summary, and explicit Administer control.
- [x] Return a server-accepted administration receipt and update visible equipment state. Keep physiology labeled as fixture-driven until Phase 03.
- [x] Add captions space, keyboard focus, reduced motion, audio mute, and responsive panel layout.

## Verification checklist

- [x] V01: At 1440×900 and 1280×720, inspect the room and open every implemented object without obscuring primary controls or monitor summary.
- [x] V02: Connect/disconnect sensors: unavailable values are labeled, connected values appear, and the rhythm timing matches displayed HR.
- [x] V03: Measure BP, advance fixture time, and confirm measurement age changes until a repeat measurement updates it.
- [x] V04: Enter a dose and route, review, cancel, and retry; only Administer produces an administration receipt.
- [x] V05: Complete the sensor and medication flow with keyboard controls; repeat with reduced motion and muted sound.
- [x] V06: Disable WebGL and confirm functional HTML controls remain available with a reduced-graphics message.

## Evidence and completion

Retain: Screenshots at both viewport sizes, a short interaction recording, and receipts from the fixture-backed flow. These do not establish clinical behavior or full integration.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux ARM64; Node.js 24.15.0; npm 11.12.1; Chromium 151.0.7922.34 with SwiftShader software WebGL; Playwright 1.63.0; Three.js 0.186.0. No provider credentials or live audio were needed for the fixture gates.
- Commands / manual steps: `npm run verify` passed (13 tests across 4 files, both builds and the client-boundary scan). `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/josey/.cache/ms-playwright/chromium-1234/chrome-linux/chrome npm run test:browser` passed all 7 browser tests. The default `npx playwright install chromium` download timed out; the existing Chromium executable was used through the supported override. Inspected the retained room/review and accepted-receipt screenshots at both target sizes. Automated camera-space clicks verified all seven 3D hotspots; HTML controls opened all seven panels at both sizes, with viewport assertions for navigation, monitor summary, and Administer, including review and receipt states.
- Results / artifact locations: [1440×900 review](../evidence/phase-02/room-1440x900.png), [1280×720 review](../evidence/phase-02/room-1280x720.png), [1440×900 receipt](../evidence/phase-02/accepted-1440x900.png), [1280×720 receipt](../evidence/phase-02/accepted-1280x720.png), [automated interaction recording](../evidence/phase-02/interaction-1280x720.webm), and server receipts for [1440](../evidence/phase-02/receipt-1440.json) / [1280](../evidence/phase-02/receipt-1280.json). These are synthetic fixture interactions, not clinical validation or a real conversation demonstration.
- V02/V03 details: disconnected ECG/SpO₂ return null measurements and labeled unavailable strips; connected HR is the same 104 beats/min pulse source used for the traces. A rhythm test verifies seven QRS peaks across a four-second strip. BP age advances from 0 to 30 seconds, resets on repeat measurement, and the previous reading remains labeled after cuff disconnection.
- V04/V05/V06 details: reviewing and canceling issue no administration request; explicit Administer returns exactly one receipt and turns the trolley tray green. Server tests reject malformed input, stale commands, duplicate administration and retry-key reuse with a different payload. Keyboard-only sensor/medication flows pass with normal and reduced motion, sound muted. Blocking WebGL context creation preserves the functional monitor and administration flow with an explicit reduced-graphics message. A lost-acknowledgment test verifies pause and recovery of the already accepted receipt without another administration.
- Remaining blockers: Phase 01 V04 still requires human-observed microphone input, a real spoken response and interruption at `/probe`; Phase 02 cannot be marked Complete until that dependency closes. No Phase 02 gate remains pending. The Vite build reports the expected large Three.js-containing client chunk (~872 kB uncompressed); hardware performance and clinical behavior are not established by these checks.

## Fixture boundary and handoff

`POST /api/fixtures` creates an isolated in-memory session; `GET /api/fixtures/:id` returns its visible state; `POST /api/fixtures/:id/commands` accepts revisioned sensor, BP, time-advance and administration commands with retry keys. Sessions reset on reload and are lost on server restart. Receipts are retained in the session and exported by the verification suite; durable event storage belongs to Phase 03.

The browser advances fixture time with one-second server commands; Pause stops those advances and waveform/breathing animation. The explicit +30 s control advances fixture time even while paused. Lost synchronization pauses the fixture and offers Refresh state. Reduced motion freezes decorative movement and displays static rhythm strips; audio defaults to muted, with optional synthetic ECG beats.

The fixture accepts syntactically supported positive medication quantities (up to the input guard of 10,000 mg), not a clinically approved dose rule. It allows one administration per session and applies no treatment effect. Eligibility, authorization, inappropriate-dose branches, clinical alarms, trends and a durable deterministic clock remain later-phase work. Oxygen/IV, diagnostic ECG/results, note editing, senior calls and suction are visibly unavailable; their room objects expose chart/status or availability information. The original real-provider probe remains at `/probe`.
