import { z } from "zod";
import {
  ClinicalReviewSchema,
  ContractVersionSchema,
  EquipmentSchema,
  ObservationSchema,
} from "./common.js";
import { StudentMedicationSchema } from "./student.js";

export const MedicationRuleSchema = StudentMedicationSchema.extend({
  referenceDoseRule: z.string().min(1),
  doseRule: z
    .object({ quantity: z.number().positive(), unit: z.string().min(1) })
    .strict(),
  contraindications: z.array(z.string().min(1)),
  requiredObservations: z.array(z.string().min(1)),
  requiredAccess: z.array(z.string().min(1)),
  authorizationRule: z.enum(["student_permitted", "senior_required"]),
  repeatIntervalMs: z.number().int().positive().nullable(),
  cumulativeLimit: z
    .object({ quantity: z.number().positive(), unit: z.string().min(1) })
    .strict()
    .nullable(),
  onsetMs: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().positive().nullable(),
  effectRule: z.string().min(1),
  reassessmentRequirement: z.string().min(1),
  inappropriateAttemptRules: z.array(
    z
      .object({ condition: z.string().min(1), outcome: z.enum(["block", "warn"]), rationale: z.string().min(1) })
      .strict(),
  ),
  clinicalReview: ClinicalReviewSchema,
}).strict();

export const FluidRuleSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    allowedVolumeUnits: z.array(z.enum(["mL", "L"])).min(1),
    allowedRateUnits: z.array(z.enum(["mL/h", "L/h"])).min(1),
    maximumVolumeMl: z.number().positive(),
    maximumRateMlPerHour: z.number().positive(),
    requiredAccess: z.literal("iv"),
    authorizationRule: z.enum(["student_permitted", "senior_required"]),
    effectRule: z.string().min(1),
    clinicalReview: ClinicalReviewSchema,
  })
  .strict();

export const OxygenRuleSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    settingLabel: z.string().min(1),
    unit: z.string().min(1),
    minimum: z.number().nonnegative(),
    maximum: z.number().positive(),
    step: z.number().positive(),
    effectRule: z.string().min(1),
    clinicalReview: ClinicalReviewSchema,
  })
  .strict();

export const InvestigationRuleSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    kind: z.enum(["ecg", "laboratory"]),
    collectionLabel: z.string().min(1),
    acquisitionDelayMs: z.number().int().nonnegative(),
    result: z.string().min(1),
    report: z.string().min(1),
    clinicalReview: ClinicalReviewSchema,
  })
  .strict();

export const ScenarioRulesSchema = z
  .object({
    baseline: z
      .object({
        heartRate: z.number().positive(),
        spo2: z.number().min(0).max(100),
        respiratoryRate: z.number().positive(),
        systolicBp: z.number().positive(),
        diastolicBp: z.number().positive(),
        painScore: z.number().min(0).max(10),
        presentation: z.string().min(1),
      })
      .strict(),
    delayedCare: z
      .object({
        entersAtMs: z.number().int().positive(),
        timesOutAtMs: z.number().int().positive(),
        observations: z
          .object({
            heartRate: z.number().positive(),
            spo2: z.number().min(0).max(100),
            respiratoryRate: z.number().positive(),
            systolicBp: z.number().positive(),
            diastolicBp: z.number().positive(),
            painScore: z.number().min(0).max(10),
            presentation: z.string().min(1),
          })
          .strict(),
        entryCondition: z.string().min(1),
        exitCondition: z.string().min(1),
        timeoutBehavior: z.string().min(1),
      })
      .strict(),
    timelyCare: z
      .object({
        entersBeforeMs: z.number().int().positive(),
        timeoutAfterMs: z.number().int().positive(),
        entryCondition: z.string().min(1),
        exitCondition: z.string().min(1),
        timeoutBehavior: z.string().min(1),
      })
      .strict(),
    inappropriateAttempt: z
      .object({
        timeoutAfterMs: z.number().int().positive(),
        entryCondition: z.string().min(1),
        exitCondition: z.string().min(1),
        timeoutBehavior: z.string().min(1),
      })
      .strict(),
    seniorAcknowledgementDelayMs: z.number().int().nonnegative(),
    clinicalReview: ClinicalReviewSchema,
  })
  .strict();

export const RubricCriterionSchema = z
  .object({
    id: z.enum([
      "assessment",
      "interpretation",
      "intervention_selection_dosing",
      "reassessment",
      "escalation",
      "communication_documentation",
    ]),
    expectedEvidence: z.array(z.string().min(1)).min(1),
    needsWorkIndicators: z.array(z.string().min(1)),
  })
  .strict();

export const HiddenRubricSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    rubricVersion: z.string().min(1),
    criteria: z.array(RubricCriterionSchema).length(6),
  })
  .strict();

export const ExaminerCriterionOutputSchema = z
  .object({
    criterion: RubricCriterionSchema.shape.id,
    rating: z.enum(["demonstrated", "needs_work", "insufficient_evidence"]),
    reason: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
  })
  .strict();

export const ExaminerOutputSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    kind: z.enum(["follow_up", "feedback"]),
    evidenceCutoffSequence: z.number().int().positive(),
    followUpQuestion: z.string().optional(),
    criteria: z.array(ExaminerCriterionOutputSchema),
    strength: z.string().optional(),
    strengthEvidenceIds: z.array(z.string().min(1)).optional(),
    priorityImprovement: z.string().optional(),
    priorityImprovementEvidenceIds: z.array(z.string().min(1)).optional(),
    nextPracticeObjective: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "follow_up" && !value.followUpQuestion?.trim()) {
      context.addIssue({ code: "custom", path: ["followUpQuestion"], message: "A follow-up output requires a question" });
    }
    if (
      value.kind === "feedback" &&
      (!value.strength?.trim() ||
        !value.strengthEvidenceIds?.length ||
        !value.priorityImprovement?.trim() ||
        !value.priorityImprovementEvidenceIds?.length ||
        !value.nextPracticeObjective?.trim() ||
        value.criteria.length !== 6)
    ) {
      context.addIssue({ code: "custom", message: "Feedback requires all six criteria and summary fields" });
    }
  });

export const CasePackSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    caseId: z.string().regex(/^[a-z][a-z0-9_]*$/),
    caseVersion: z.string().min(1),
    title: z.string().min(1),
    educationalUse: z.literal("formative_simulation_only"),
    clinicalReview: ClinicalReviewSchema,
    patient: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
        fictional: z.literal(true),
        ageYears: z.number().int().positive(),
        weightKg: z.number().positive(),
        presentingComplaint: z.string().min(1),
        symptomOnset: z.string().min(1),
        painDescription: z.string().min(1),
        allergies: z.array(z.string()),
        currentMedications: z.array(z.string()),
        comorbidities: z.array(z.string()),
      })
      .strict(),
    opening: z.string().min(1),
    voiceBriefing: z.string().min(1),
    observations: z.array(ObservationSchema).min(1),
    equipment: z.array(EquipmentSchema).min(1),
    investigations: z.array(InvestigationRuleSchema).min(1),
    oxygenRules: z.array(OxygenRuleSchema).min(1),
    medicationRules: z.array(MedicationRuleSchema).min(1),
    fluidRules: z.array(FluidRuleSchema).min(1),
    scenarioRules: ScenarioRulesSchema,
    hiddenRubric: HiddenRubricSchema,
    unresolvedClinicalParameters: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type MedicationRule = z.infer<typeof MedicationRuleSchema>;
export type FluidRule = z.infer<typeof FluidRuleSchema>;
export type OxygenRule = z.infer<typeof OxygenRuleSchema>;
export type InvestigationRule = z.infer<typeof InvestigationRuleSchema>;
export type ScenarioRules = z.infer<typeof ScenarioRulesSchema>;
export type HiddenRubric = z.infer<typeof HiddenRubricSchema>;
export type ExaminerOutput = z.infer<typeof ExaminerOutputSchema>;
export type CasePack = z.infer<typeof CasePackSchema>;

export function toStudentCase(casePack: CasePack) {
  return {
    contractVersion: casePack.contractVersion,
    caseId: casePack.caseId,
    caseVersion: casePack.caseVersion,
    title: casePack.title,
    educationalUse: casePack.educationalUse,
    clinicalReviewStatus: casePack.clinicalReview.reviewStatus,
    patient: {
      id: casePack.patient.id,
      displayName: casePack.patient.displayName,
      ageYears: casePack.patient.ageYears,
      weightKg: casePack.patient.weightKg,
      presentingComplaint: casePack.patient.presentingComplaint,
      allergies: casePack.patient.allergies,
      currentMedications: casePack.patient.currentMedications,
    },
    opening: casePack.opening,
    voiceBriefing: casePack.voiceBriefing,
    initialObservations: casePack.observations.filter(
      (observation) => observation.studentVisible && observation.observableBy === "initial",
    ),
    equipment: casePack.equipment,
    assessmentOptions: casePack.observations
      .filter((observation) =>
        ["history", "assessment"].includes(observation.observableBy),
      )
      .map(({ id, label, observableBy }) => ({
        id,
        label,
        kind: observableBy as "history" | "assessment",
      })),
    investigations: casePack.investigations.map(
      ({ id, label, kind, collectionLabel, acquisitionDelayMs }) => ({
        id,
        label,
        kind,
        collectionLabel,
        acquisitionDelayMs,
      }),
    ),
    oxygenOptions: casePack.oxygenRules.map(
      ({ id, name, settingLabel, unit, minimum, maximum, step }) => ({
        id,
        name,
        settingLabel,
        unit,
        minimum,
        maximum,
        step,
      }),
    ),
    fluids: casePack.fluidRules.map(
      ({
        id,
        name,
        allowedVolumeUnits,
        allowedRateUnits,
        maximumVolumeMl,
        maximumRateMlPerHour,
        authorizationRule,
      }) => ({
        id,
        name,
        allowedVolumeUnits,
        allowedRateUnits,
        maximumVolumeMl,
        maximumRateMlPerHour,
        authorizationRule,
      }),
    ),
    formulary: casePack.medicationRules.map(
      ({
        contractVersion,
        id,
        name,
        formulation,
        concentration,
        allowedUnits,
        allowedRoutes,
        patientInformation,
      }) => ({
        contractVersion,
        id,
        name,
        formulation,
        concentration,
        allowedUnits,
        allowedRoutes,
        patientInformation,
      }),
    ),
  };
}
