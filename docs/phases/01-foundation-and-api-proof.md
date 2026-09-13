# Phase 01 — Foundation, case contract, and API proof

Status: Not started.

Dependencies: None.

Specification: [specs.md](../../specs.md), sections 1, 3, 6, 7, 10.

## Outcome

An application skeleton and independently runnable probes establish the project structure and both real provider integrations.

## Implementation checklist

- [ ] Create TypeScript client/, server/, shared/, case/, and docs/ structure with documented install, development, build, and verification commands.
- [ ] Define versioned case, observation, equipment, medication-rule, event, and examiner-output schemas. Include separate hidden rubric and student-visible data contracts.
- [ ] Author the fictional patient and initial chest-pain case draft, with clinical source/revision and review-status fields. List unresolved clinical parameters explicitly.
- [ ] Add server-only configuration and a value-free .env.example; expose connection health without returning credentials.
- [ ] Implement a minimal browser Live conversation probe and a separate real Astra Agents API session that requests an application function and receives its result.
- [ ] Document the chosen package versions, provider contracts, run instructions, and clinical review checklist.

## Verification checklist

- [ ] V01: From a clean checkout, follow documented setup and build commands successfully; missing configuration produces actionable errors.
- [ ] V02: Validate one complete case fixture; confirm missing units, invalid event types, and absent required fields fail schema validation.
- [ ] V03: Inspect the client bundle and browser network responses for provider secrets and hidden rubric content; neither is present.
- [ ] V04: Run the browser probe: microphone input produces a real spoken response and interruption works.
- [ ] V05: Run the examiner probe: a real managed session requests a tool, consumes its result, and returns output; retain sanitized session/tool receipts.
- [ ] V06: Confirm mocked connections are labeled and cannot satisfy the real API gates. Mark access failures blocked instead of passing the phase.

## Evidence and completion

Retain: Setup transcript, schema validation results, sanitized provider receipts, and the clinical-content review checklist.

Record verification commands or manual steps, actual results, and artifact locations in this document when implemented. Do not invent commands before the relevant tooling exists. Check a gate only after observing its result. Mark this phase complete only when all implementation and verification items pass and its dependencies are complete.

## Verification record

- Date / environment: pending
- Commands / manual steps: pending
- Results / artifact locations: pending
- Remaining blockers: not yet assessed
