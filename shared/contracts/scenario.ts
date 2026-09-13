import { z } from "zod";

export const SensorSchema = z.enum(["ecg", "spo2", "cuff"]);

export const MedicationOrderInputSchema = z
  .object({
    drugId: z.string().min(1),
    dose: z.number().finite().nullable(),
    unit: z.string().min(1).nullable(),
    route: z.string().min(1).nullable(),
  })
  .strict();

export const ReviewableMedicationOrderSchema = MedicationOrderInputSchema.extend({
  dose: z.number().positive().finite(),
  unit: z.string().min(1),
  route: z.string().min(1),
});

export const ScenarioCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z
    .object({
      type: z.literal("advance"),
      seconds: z.number().int().min(1).max(3600),
    })
    .strict(),
  z
    .object({
      type: z.literal("sensor"),
      sensor: SensorSchema,
      connected: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("measure_bp") }).strict(),
  z
    .object({
      type: z.literal("perform_assessment"),
      findingId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("request_investigation"),
      investigationId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("collect_investigation"),
      investigationId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("display_investigation"),
      investigationId: z.string().min(1),
      view: z.enum(["result", "report", "artwork"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("interpret_investigation"),
      investigationId: z.string().min(1),
      interpretation: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("request_case_item"),
      kind: z.enum(["investigation", "medication"]),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_oxygen"),
      deviceId: z.string().min(1),
      setting: z.number().finite(),
      unit: z.string().min(1),
    })
    .strict(),
  z.object({ type: z.literal("stop_oxygen") }).strict(),
  z
    .object({
      type: z.literal("confirm_medication_checks"),
      allergyHistoryReviewed: z.literal(true),
      administrationHistoryReviewed: z.literal(true),
    })
    .strict(),
  z.object({ type: z.literal("establish_iv") }).strict(),
  z.object({ type: z.literal("inspect_iv_patency") }).strict(),
  z
    .object({
      type: z.literal("start_fluid"),
      fluidId: z.string().min(1),
      volume: z.number().finite(),
      volumeUnit: z.string().min(1),
      rate: z.number().finite(),
      rateUnit: z.string().min(1),
    })
    .strict(),
  z.object({ type: z.literal("stop_fluid") }).strict(),
  z
    .object({
      type: z.literal("prepare_medication"),
      order: MedicationOrderInputSchema,
      source: z.enum(["voice", "text"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_prepared_medication"),
      preparedOrderId: z.string().min(1),
      order: MedicationOrderInputSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("cancel_medication"), preparedOrderId: z.string().min(1) })
    .strict(),
  z
    .object({ type: z.literal("administer_prepared"), preparedOrderId: z.string().min(1) })
    .strict(),
  z.object({ type: z.literal("request_senior") }).strict(),
  z
    .object({
      type: z.literal("request_authorization"),
      actionKind: z.enum(["medication", "fluid"]),
      itemId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("save_note"),
      content: z.string().trim().min(1).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal("record_handoff"),
      content: z.string().trim().min(1).max(10000),
    })
    .strict(),
  z.object({ type: z.literal("finish") }).strict(),
  z
    .object({
      type: z.literal("set_lifecycle"),
      lifecycle: z.enum(["handoff", "debrief", "ended"]),
    })
    .strict(),
]);

export const CommandEnvelopeSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
    command: ScenarioCommandSchema,
  })
  .strict();

export type ScenarioCommand = z.infer<typeof ScenarioCommandSchema>;
export type MedicationOrderInput = z.infer<typeof MedicationOrderInputSchema>;
export type ReviewableMedicationOrder = z.infer<
  typeof ReviewableMedicationOrderSchema
>;

export interface AdministrationReceipt {
  id: string;
  medicationId: string;
  dose: number;
  unit: string;
  route: string;
  normalizedQuantity: number;
  normalizedUnit: string;
  cumulativeQuantity: number;
  simulationTimeMs: number;
  actor: "student";
  status: "administered";
  mode: "development_fixture" | "clinically_reviewed";
  effectDueAtMs: number | null;
}

export interface ScenarioState {
  id: string;
  revision: number;
  caseVersion: string;
  mode: "development_fixture" | "clinically_reviewed";
  lifecycle: "active" | "handoff" | "debrief" | "ended";
  clock: {
    simulationTimeMs: number;
    running: boolean;
    timeScale: number;
  };
  physiology: {
    heartRate: number;
    spo2: number;
    respiratoryRate: number;
    systolicBp: number;
    diastolicBp: number;
    painScore: number;
    presentation: string;
  };
  sensors: { ecg: boolean; spo2: boolean; cuff: boolean };
  measurements: {
    hr: number | null;
    spo2: number | null;
    rr: number;
    bp: {
      systolic: number;
      diastolic: number;
      value: string;
      measuredAtMs: number;
    } | null;
  };
  assessments: Array<{
    id: string;
    label: string;
    kind: "history" | "assessment";
    value: string | number | boolean;
    unit?: string;
    firstPerformedAtMs: number;
    lastPerformedAtMs: number;
    count: number;
  }>;
  investigations: Array<{
    id: string;
    label: string;
    kind: "ecg" | "laboratory";
    status: "not_requested" | "requested" | "collected" | "pending" | "available" | "displayed";
    requestedAtMs: number | null;
    collectedAtMs: number | null;
    availableAtMs: number | null;
    displayedAtMs: number | null;
    displayedViews: Array<"result" | "report" | "artwork">;
    result: string | null;
    report: string | null;
    interpretations: Array<{ content: string; simulationTimeMs: number }>;
  }>;
  devices: {
    oxygen: {
      status: "off" | "running";
      deviceId: string | null;
      setting: number;
      unit: string | null;
    };
    ivAccess: {
      established: boolean;
      patency: "not_assessed" | "patent";
      lastInspectedAtMs: number | null;
    };
    fluidPump: {
      status: "idle" | "running" | "stopped" | "completed";
      fluidId: string | null;
      prescribedVolumeMl: number;
      rateMlPerHour: number;
      deliveredVolumeMl: number;
      startedAtMs: number | null;
    };
  };
  treatments: {
    prerequisites: {
      allergyHistoryReviewed: boolean;
      administrationHistoryReviewed: boolean;
    };
    receipts: AdministrationReceipt[];
    preparedOrders: Array<{
      id: string;
      order: MedicationOrderInput;
      source: "ui" | "voice" | "text";
      preparedAtMs: number;
      status: "prepared" | "canceled" | "blocked" | "administered";
      statusAtMs: number;
      message: string;
    }>;
    cumulativeDoses: Record<string, { quantity: number; unit: string }>;
    pendingEffects: Array<{
      id: string;
      medicationId: string;
      dueAtMs: number;
      causedBy: string;
    }>;
    appliedEffects: Array<{
      medicationId: string;
      appliedAtMs: number;
      rule: string;
      causedBy: string;
    }>;
  };
  senior: {
    requestedAtMs: number | null;
    acknowledgedAtMs: number | null;
  };
  authorizations: Array<{
    id: string;
    actionKind: "medication" | "fluid";
    itemId: string;
    status: "requested" | "authorized";
    requestedAtMs: number;
    authorizedAtMs: number | null;
  }>;
  notes: Array<{
    revision: number;
    content: string;
    savedAtMs: number;
    eventId: string;
  }>;
  handoffs: Array<{
    content: string;
    recordedAtMs: number;
    eventId: string;
  }>;
  finishedAtMs: number | null;
  branch: {
    kind: "arrival" | "timely_care" | "delayed_care" | "inappropriate_attempt";
    enteredAtMs: number;
    status: "active" | "completed" | "timed_out";
    reason: string;
    timeoutAtMs: number | null;
  };
  branchHistory: Array<{
    kind: "arrival" | "timely_care" | "delayed_care" | "inappropriate_attempt";
    enteredAtMs: number;
    exitedAtMs: number;
    outcome: string;
  }>;
  lastCommandResult: {
    status: "accepted" | "rejected";
    message: string;
  } | null;
}

export interface ScenarioSnapshot extends ScenarioState {
  receipts: AdministrationReceipt[];
  simulationTimeMs: number;
}
