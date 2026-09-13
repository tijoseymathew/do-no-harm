import { z } from "zod";
import { ContractVersionSchema } from "./common.js";
import { ExaminerOutputSchema } from "./server.js";

export const FinishRunInputSchema = z
  .object({
    noteContent: z.string().trim().max(10000).nullable().optional(),
    pendingTranscript: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const EvidenceKindSchema = z.enum([
  "finding",
  "investigation",
  "note_revision",
  "transcript_segment",
  "medication_receipt",
  "action",
]);

export const EvidenceCardSchema = z
  .object({
    id: z.string().min(1),
    sequence: z.number().int().positive(),
    simulationTimeMs: z.number().int().nonnegative(),
    kind: EvidenceKindSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    detail: z.string().min(1),
    superseded: z.boolean(),
    assisted: z.boolean(),
  })
  .strict();

export const TrendPointSchema = z
  .object({
    simulationTimeMs: z.number().int().nonnegative(),
    heartRate: z.number(),
    spo2: z.number(),
    respiratoryRate: z.number(),
    systolicBp: z.number(),
    diastolicBp: z.number(),
  })
  .strict();

export const TimelineMarkerSchema = z
  .object({
    eventId: z.string().min(1),
    simulationTimeMs: z.number().int().nonnegative(),
    kind: z.enum(["assessment", "treatment", "alarm", "escalation"]),
    label: z.string().min(1),
  })
  .strict();

export const ActionItemSchema = z
  .object({
    eventId: z.string().min(1),
    sequence: z.number().int().positive(),
    simulationTimeMs: z.number().int().nonnegative(),
    status: z.enum(["attempted", "blocked", "prepared", "completed"]),
    label: z.string().min(1),
  })
  .strict();

export const FeedbackRevisionSchema = z
  .object({
    revision: z.number().int().positive(),
    label: z.string().min(1),
    cutoffName: z.string().min(1),
    evidenceCutoffSequence: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    trigger: z.enum(["finish", "late_evidence", "retry"]),
    output: ExaminerOutputSchema,
  })
  .strict();

export const DebriefSnapshotSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    runId: z.string().min(1),
    formative: z.literal(true),
    status: z.enum(["not_started", "evaluating", "ready", "unavailable"]),
    evaluationMessage: z.string().min(1).nullable(),
    cutoffName: z.string().min(1),
    evidenceCutoffSequence: z.number().int().positive(),
    transcriptDrain: z
      .object({
        status: z.enum(["flushed", "empty", "timed_out"]),
        timeoutMs: z.number().int().positive(),
      })
      .strict(),
    trend: z.array(TrendPointSchema).min(1),
    markers: z.array(TimelineMarkerSchema),
    actions: z.array(ActionItemSchema),
    evidence: z.array(EvidenceCardSchema),
    feedbackRevisions: z.array(FeedbackRevisionSchema),
    activeFeedbackRevision: z.number().int().positive().nullable(),
    teachBack: z
      .object({
        question: z.string().min(1),
        requestedAt: z.iso.datetime(),
        assisted: z.literal(true),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type FinishRunInput = z.infer<typeof FinishRunInputSchema>;
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;
export type DebriefSnapshot = z.infer<typeof DebriefSnapshotSchema>;
export type FeedbackRevision = z.infer<typeof FeedbackRevisionSchema>;
