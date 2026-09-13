# Clinical content review checklist

Case: `adult_chest_pain` version `1.0.0-draft.2`.

Status: **Draft, unreviewed. Not educationally validated.**

Machine-readable rule inventory and current review results: [Phase 03 clinical-rule review record](evidence/phase-03/clinical-rule-review.json). Every listed rule is restricted to `development_fixture_only` until this checklist is signed.

The fictional patient and schema are suitable for software integration only until an appropriately qualified reviewer completes this checklist for the whole case. Software tests do not constitute clinical review.

## Source and scope

- [ ] Confirm the intended jurisdiction and name the local acute-coronary-syndrome protocol and revision.
- [ ] Confirm the Resuscitation Council UK ABCDE page revision recorded in the fixture: published October 2015, reviewed May 2021, updated July 2024.
- [ ] Confirm the scenario is explicitly formative and does not imply patient-specific medical advice.
- [ ] Confirm the patient is coherent across history, examination, observations, investigations, and branches.

## Presentation and investigations

- [ ] Review age, weight, symptom onset, pain description, allergies, medicines, comorbidities, and initial observations.
- [ ] Select and document the final diagnosis and plausible differential diagnoses.
- [ ] Review the 12-lead ECG finding and calibrated artwork with an appropriate specialist.
- [ ] Review investigation names, collection delays, availability times, values, units, and reference ranges.
- [ ] Review each hidden/releasable fact for whether the patient, nurse, device, or result may disclose it.

## Treatments and progression

- [ ] Review the complete aspirin rule: indication, 300 mg oral crushed/chewed example, contraindications, prerequisites, duplicate handling, and lack of an instant vital-sign effect.
- [ ] Review the 60-second aspirin engine effect marker and confirm that it records the authored action without changing vital signs.
- [ ] If nitrate or analgesia is added, review its dose, unit, formulation, route, contraindications, authorization, repeat interval, cumulative maximum, onset/duration, and response rule.
- [ ] Review oxygen thresholds and every available device/setting for this patient.
- [ ] Review IV access, fluid availability, volume/rate limits, contraindications, and effects.
- [ ] Review or replace the sodium-chloride development fixture's 500 mL volume limit, 1,000 mL/h rate limit, and no-physiology-effect behavior.
- [ ] Review timely, delayed, and inappropriate-attempt paths, including entry conditions, observation changes, effect delays, exits, and timeouts.
- [ ] Confirm acceptable alternative action orders and escalation choices are not incorrectly penalized.
- [ ] Confirm unsupported actions are blocked or labeled unavailable without invented consequences.

## Assessment and safety

- [ ] Review all six hidden rubric criteria against observable event evidence.
- [ ] Confirm attempted, prepared, authorized, administered, and stopped actions remain distinct.
- [ ] Confirm the examiner cannot infer an adverse outcome that is absent from authored events.
- [ ] Confirm feedback wording is formative, evidence-linked, and does not claim clinical prediction.
- [ ] Run the complete case together with the clinical reviewer, including incomplete and inappropriate-attempt endings.

## Sign-off

- Reviewer name / role: pending
- Protocol / revision: pending
- Review date: pending
- Required changes: pending
- Approval decision: pending

After approval, update the case's `clinicalReview.reviewStatus`, `reviewedBy`, and `reviewedAt` fields in the same reviewed change. Resolve or explicitly disposition every item in `unresolvedClinicalParameters`; do not merely delete that list.
