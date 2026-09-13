# Phase 01 — Foundation, case contract, and API proof

Status: Blocked.

Dependencies: None.

Specification: [specs.md](../../specs.md), sections 1, 3, 6, 7, 10.

## Outcome

An application skeleton and independently runnable probes establish the project structure and both real provider integrations.

## Implementation checklist

- [x] Create TypeScript client/, server/, shared/, case/, and docs/ structure with documented install, development, build, and verification commands.
- [x] Define versioned case, observation, equipment, medication-rule, event, and examiner-output schemas. Include separate hidden rubric and student-visible data contracts.
- [x] Author the fictional patient and initial chest-pain case draft, with clinical source/revision and review-status fields. List unresolved clinical parameters explicitly.
- [x] Add server-only configuration and a value-free .env.example; expose connection health without returning credentials.
- [x] Implement a minimal browser Live conversation probe and a separate real Astra Agents API session that requests an application function and receives its result.
- [x] Document the chosen package versions, provider contracts, run instructions, and clinical review checklist.

## Verification checklist

- [x] V01: From a clean checkout, follow documented setup and build commands successfully; missing configuration produces actionable errors.
- [x] V02: Validate one complete case fixture; confirm missing units, invalid event types, and absent required fields fail schema validation.
- [x] V03: Inspect the client bundle and browser network responses for provider secrets and hidden rubric content; neither is present.
- [ ] V04: Run the browser probe: microphone input produces a real spoken response and interruption works.
- [x] V05: Run the examiner probe: a real managed session requests a tool, consumes its result, and returns output; retain sanitized session/tool receipts.
- [x] V06: Confirm mocked connections are labeled and cannot satisfy the real API gates. Mark access failures blocked instead of passing the phase.

## Evidence and completion

Retain: Setup transcript, schema validation results, sanitized provider receipts, and the clinical-content review checklist.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: 13 September 2026; Linux; Node.js v24.15.0; npm 11.12.1; non-interactive terminal in Asia/Singapore.
- Commands / manual steps: `npm ci`; `npm run verify`; `npm start` with local HTTP checks; `npm run probe:examiner`. See [setup and verification evidence](../evidence/setup-and-verification.md).
- Results / artifact locations: automated checks passed (2 files / 9 tests; 3 client build files scanned); real Astra managed session and application function round trip passed. Sanitized receipt: [examiner-session-receipt.json](../evidence/examiner-session-receipt.json). Clinical review: [clinical-review-checklist.md](../clinical-review-checklist.md).
- Remaining blockers: V04 requires a human-observed microphone, spoken reply, and interruption check in a browser. The terminal environment cannot honestly verify audio behavior. Run the documented browser steps and record the result before changing this phase to Complete. Clinical content intentionally remains `draft_unreviewed`; that status does not block this API-proof phase but must not be presented as educationally validated.
