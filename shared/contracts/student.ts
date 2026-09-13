import { z } from "zod";
import { ContractVersionSchema, EquipmentSchema, ObservationSchema } from "./common.js";

export const StudentMedicationSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    formulation: z.string().min(1),
    concentration: z.string().min(1).optional(),
    allowedUnits: z.array(z.string().min(1)).min(1),
    allowedRoutes: z.array(z.string().min(1)).min(1),
    patientInformation: z.string().min(1),
  })
  .strict();

export const StudentCaseSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    caseId: z.string().regex(/^[a-z][a-z0-9_]*$/),
    caseVersion: z.string().min(1),
    title: z.string().min(1),
    educationalUse: z.literal("formative_simulation_only"),
    clinicalReviewStatus: z.enum(["draft_unreviewed", "review_in_progress", "reviewed"]),
    patient: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
        ageYears: z.number().int().positive(),
        weightKg: z.number().positive(),
        presentingComplaint: z.string().min(1),
        allergies: z.array(z.string()),
        currentMedications: z.array(z.string()),
      })
      .strict(),
    opening: z.string().min(1),
    voiceBriefing: z.string().min(1),
    initialObservations: z.array(ObservationSchema),
    equipment: z.array(EquipmentSchema),
    assessmentOptions: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.enum(["history", "assessment"]),
      }).strict(),
    ),
    investigations: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.enum(["ecg", "laboratory"]),
        collectionLabel: z.string().min(1),
        acquisitionDelayMs: z.number().int().nonnegative(),
      }).strict(),
    ),
    oxygenOptions: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        settingLabel: z.string().min(1),
        unit: z.string().min(1),
        minimum: z.number().nonnegative(),
        maximum: z.number().positive(),
        step: z.number().positive(),
      }).strict(),
    ),
    fluids: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        allowedVolumeUnits: z.array(z.enum(["mL", "L"])),
        allowedRateUnits: z.array(z.enum(["mL/h", "L/h"])),
        maximumVolumeMl: z.number().positive(),
        maximumRateMlPerHour: z.number().positive(),
        authorizationRule: z.enum(["student_permitted", "senior_required"]),
      }).strict(),
    ),
    formulary: z.array(StudentMedicationSchema),
  })
  .strict();

export type StudentCase = z.infer<typeof StudentCaseSchema>;
export type StudentMedication = z.infer<typeof StudentMedicationSchema>;
