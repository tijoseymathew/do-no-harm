import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;

export const ContractVersionSchema = z.literal(CONTRACT_VERSION);

export const ClinicalReviewSchema = z
  .object({
    sourceTitle: z.string().min(1),
    sourceUrl: z.url().optional(),
    sourcePath: z.string().min(1).optional(),
    sourceRevision: z.string().min(1),
    sourceApplicability: z.enum([
      "clinical_source",
      "context_only",
      "local_development_fixture",
    ]),
    reviewStatus: z.enum(["draft_unreviewed", "review_in_progress", "reviewed"]),
    reviewedBy: z.string().min(1).optional(),
    reviewedAt: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.sourceUrl && !value.sourcePath) {
      context.addIssue({
        code: "custom",
        message: "Clinical review provenance requires a source URL or local path",
      });
    }
    if (value.reviewStatus === "reviewed" && (!value.reviewedBy || !value.reviewedAt)) {
      context.addIssue({
        code: "custom",
        message: "Reviewed clinical content requires reviewedBy and reviewedAt",
      });
    }
  });

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const ObservationSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    kind: z.enum(["vital", "symptom", "examination", "investigation"]),
    value: z.union([z.number(), z.string(), z.boolean()]),
    unit: z.string().min(1).optional(),
    observableBy: z.enum(["initial", "history", "assessment", "device", "result"]),
    studentVisible: z.boolean(),
    availableAtSimulationMs: z.number().int().nonnegative(),
    clinicalReview: ClinicalReviewSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (typeof value.value === "number" && !value.unit) {
      context.addIssue({ code: "custom", path: ["unit"], message: "Numeric observations require a unit" });
    }
  });

export const EquipmentSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    kind: z.enum([
      "heart_monitor",
      "oxygen_station",
      "iv_station",
      "ecg_machine",
      "medication_trolley",
      "results_workstation",
      "clipboard",
      "call_station",
      "suction",
    ]),
    availability: z.enum(["available", "visible_unavailable"]),
    supportedActions: z.array(z.string().min(1)),
  })
  .strict();

export const EventTypeSchema = z.enum([
  "session.started",
  "session.paused",
  "session.resumed",
  "session.handoff_started",
  "session.debrief_started",
  "session.ended",
  "transcript.recorded",
  "assessment.requested",
  "assessment.performed",
  "equipment.connected",
  "equipment.setting_changed",
  "investigation.requested",
  "investigation.available",
  "investigation.displayed",
  "investigation.interpreted",
  "medication.attempted",
  "medication.prepared",
  "medication.blocked",
  "medication.canceled",
  "medication.authorized",
  "medication.administered",
  "medication.stopped",
  "observation.published",
  "note.saved",
  "senior.requested",
  "senior.acknowledged",
  "handoff.recorded",
  "examiner.output_submitted",
  "presenter.intervention",
  "command.rejected",
  "branch.entered",
  "branch.exited",
  "treatment.effect_applied",
  "fluid.started",
  "fluid.stopped",
  "fluid.completed",
]);

export const MedicationEventPayloadSchema = z
  .object({
    medicationId: z.string().min(1),
    entered: z
      .object({
        quantity: z.number().nullable(),
        unit: z.string().min(1).nullable(),
        route: z.string().min(1).nullable(),
      })
      .strict(),
    normalized: z
      .object({ quantity: z.number().positive(), unit: z.string().min(1) })
      .strict()
      .nullable(),
    validation: z
      .object({ status: z.enum(["accepted", "rejected"]), reasons: z.array(z.string().min(1)) })
      .strict(),
    administrationStatus: z.enum([
      "attempted",
      "prepared",
      "blocked",
      "canceled",
      "authorized",
      "administered",
      "stopped",
    ]),
  })
  .strict();

export const RunEventSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    id: z.string().min(1),
    runId: z.string().min(1),
    sequence: z.number().int().positive(),
    wallTime: z.iso.datetime(),
    simulationTime: z.number().int().nonnegative(),
    actor: z.enum(["student", "patient", "nurse", "examiner", "engine", "presenter", "system"]),
    type: EventTypeSchema,
    payload: JsonValueSchema,
    stateVersion: z.number().int().nonnegative(),
    caseVersion: z.string().min(1),
    causedBy: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.type.startsWith("medication.")) return;
    const result = MedicationEventPayloadSchema.safeParse(value.payload);
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: "Medication events must preserve entered parameters, normalization, validation, and administration status",
      });
    }
  });

export type ClinicalReview = z.infer<typeof ClinicalReviewSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type MedicationEventPayload = z.infer<typeof MedicationEventPayloadSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
