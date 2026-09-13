# Phase 04 — Complete assessment, treatment, and handoff workflow

Status: Blocked — implementation and software verification pass; qualified clinical review and Phase 03 completion remain pending.

Dependencies: Phases 02 and 03.

Specification: [specs.md](../../specs.md), sections 3, 4, 7, 10.

## Outcome

One complete student run can be performed through room and HTML controls, using text before full voice orchestration.

## Implementation checklist

- [x] Expose focused patient history and examination findings with availability rules.
- [ ] Implement ECG acquisition, reviewed 12-lead artwork with calibration/lead labels, zoom, report access, and student interpretation. The complete interaction and calibrated development artwork pass software review; specialist ECG review remains pending.
- [x] Implement case-specific labs with requested, collected, pending, available, and displayed states.
- [x] Complete oxygen device/setting controls and IV access, patency, fluid volume/rate, start/stop, and cumulative delivery.
- [ ] Complete the reviewed case formulary with allergy/history checks, treatment status history, and explicit simulated authorization. The workflow is complete, but the case pack remains `draft_unreviewed` pending qualified review.
- [x] Implement saved note revisions, senior request/acknowledgment, text handoff, and an explicit Finish action.

## Verification checklist

- [x] V01: Run arrival → assessment → ECG → medication administration → reassessment → handoff → Finish without editing server state.
- [x] V02: Attempt an investigation before its acquisition delay expires; no result is revealed. Open it later and verify distinct request/availability/display events.
- [x] V03: Apply, adjust, and stop supported oxygen/IV settings; confirm equipment state and delivery totals match events.
- [x] V04: Prepare but do not administer a medication; confirm no dose/effect is applied. Complete a supported administration and a blocked inappropriate attempt.
- [x] V05: Perform an acceptable alternative action sequence and reassess more than once; the workflow permits both.
- [x] V06: Save and revise notes, request supervised action, and give a handoff; verify notes, authorization, and actual action statuses remain distinct.
- [x] V07: Ask for an unsupported test or drug; the application reports its case limitation without inventing findings.

## Evidence and completion

Retain: A complete text-controlled run export, ECG/content review record, and recordings of normal and blocked-action flows.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux ARM64; Node.js 24.15.0; npm 11.12.1; Chromium 151.0.7922.34 with SwiftShader software WebGL; Vitest 5.0.0; Playwright 1.63.0.
- Commands / manual steps: `npm run verify` passed type checks, all 30 unit/API/component tests across 5 files, both production builds, and the built-client boundary scan. `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/josey/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell npm run test:browser` passed all 8 browser tests. The matching Playwright Chromium download was attempted twice but the CDN timed out; the existing tested Chromium executable was selected through the repository's supported override. The retained 1280×720 capture was visually inspected after the viewport assertions passed.
- V01/V05: [`tests/browser/phase04.spec.ts`](../../tests/browser/phase04.spec.ts) drives one fresh run through focused history/examination, monitoring, BP, delayed ECG, interpretation, medication, oxygen/IV, repeated pain reassessment, two note revisions, senior contact, structured handoff and Finish solely through rendered controls. No mandatory action order is encoded; engine tests repeat assessments before and after deterministic deterioration.
- V02: The browser requests and acquires the ECG, attempts to open it while pending and receives no finding, advances simulation time, then separately opens artwork and report and saves an interpretation. Engine assertions verify ordered `investigation.requested`, `investigation.collected`, `investigation.available`, `investigation.displayed`, and `investigation.interpreted` events; the visible result/report remain null until display.
- V03: The browser applies nasal cannula oxygen at 2 L/min, adjusts to 4 L/min and stops it. It establishes IV access, inspects patency, obtains explicit simulated fluid authorization, starts 100 mL at 600 mL/h, advances 30 seconds, and stops with the displayed cumulative delivery matching engine evidence. Focused engine tests independently assert a 5 mL total for the exact 30-second interval.
- V04: Review creates a server-visible `prepared` order and cancellation/absence of the final action produces no receipt. The retained run attempts 600 mg, records a blocked status with no dose/effect, then prepares and administers the supported parameters to create exactly one receipt. Retry, double-click and lost-acknowledgment coverage remains green.
- V06/V07: Authorization request/grant, senior request/acknowledgment, handoff content and performed treatment are distinct state and event records. Saved notes retain revision 1 and revision 2 verbatim. An unsupported CT coronary angiogram request returns an explicit case-limit message and creates no finding.
- Results / artifact locations: [complete run export](../evidence/phase-04/complete-run.json), [1280×720 final state](../evidence/phase-04/complete-run-1280x720.png), [normal and blocked-flow recording](../evidence/phase-04/complete-and-blocked-flow-1280x720.webm), and [ECG/formulary content review record](../evidence/phase-04/content-review.json). The JSON export contains the visible final state and append-only event log without the hidden rubric or expected dose rule.
- Remaining blockers: A qualified reviewer must complete [`docs/clinical-review-checklist.md`](../clinical-review-checklist.md), approve or replace the development 12-lead ECG pattern/report, name the local protocol and resolve the investigation, oxygen, IV-fluid, aspirin and overall case-coherence parameters. Until then the server and UI correctly label runs `development_fixture` / clinically unreviewed, the two review-dependent implementation items remain unchecked, and Phase 03 and this phase cannot be marked Complete. Phase 01's Live audio gate and Phase 02 are complete. The Vite build reports the known Three.js-containing client chunk warning (~889 kB uncompressed), without failing build or browser checks.

## Workflow boundary and handoff

The student-facing case exposes question/examination choices but not their authored answers until the server accepts the assessment. Investigation catalog metadata is visible, while results stay null through request, collection and pending states. One simulation clock releases results, senior acknowledgment, authorization, medication effects and fluid delivery. Unsupported-item requests are acknowledged as unavailable without adding data.

Medication preparation is now an authoritative server state: only `administer_prepared` can create a receipt or effect. Oxygen changes, IV access/patency, fluid parameters and cumulative volume are reflected immediately. Note revisions and handoffs append rather than overwrite. Handoff moves the lifecycle separately; Finish requires a recorded handoff, freezes time at the evidence cutoff and enables a compact `GET /api/runs/:id/export` download without hidden rules.
