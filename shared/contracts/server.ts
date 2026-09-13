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
    followUpQuestion: z.string().min(1).optional(),
    criteria: z.array(ExaminerCriterionOutputSchema),
    strength: z.string().min(1).optional(),
    priorityImprovement: z.string().min(1).optional(),
    nextPracticeObjective: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "follow_up" && !value.followUpQuestion) {
      context.addIssue({ code: "custom", path: ["followUpQuestion"], message: "A follow-up output requires a question" });
    }
    if (
      value.kind === "feedback" &&
      (!value.strength || !value.priorityImprovement || !value.nextPracticeObjective || value.criteria.length !== 6)
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
    medicationRules: z.array(MedicationRuleSchema).min(1),
    hiddenRubric: HiddenRubricSchema,
    unresolvedClinicalParameters: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type MedicationRule = z.infer<typeof MedicationRuleSchema>;
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
