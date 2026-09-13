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
      type: z.literal("confirm_medication_checks"),
      allergyHistoryReviewed: z.literal(true),
      administrationHistoryReviewed: z.literal(true),
    })
    .strict(),
  z.object({ type: z.literal("establish_iv") }).strict(),
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
    .object({ type: z.literal("administer"), order: MedicationOrderInputSchema })
    .strict(),
  z.object({ type: z.literal("request_senior") }).strict(),
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
  devices: {
    ivAccess: { established: boolean };
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
