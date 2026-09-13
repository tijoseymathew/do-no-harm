import { z } from "zod";

export const ConversationRoleSchema = z.enum(["student", "patient", "nurse", "examiner"]);
export const ConversationSourceSchema = z.enum(["authored", "voice", "text"]);

export const TextTurnInputSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    source: z.enum(["voice", "text"]),
    interrupted: z.boolean().optional(),
  })
  .strict();

export const TranscriptCorrectionInputSchema = z
  .object({
    messageId: z.string().min(1),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

export const CheckpointInputSchema = z
  .object({ kind: z.enum(["assessment", "treatment", "handoff", "reasoning", "debrief"]) })
  .strict();

export interface ConversationMessage {
  id: string;
  eventId: string;
  role: z.infer<typeof ConversationRoleSchema>;
  source: z.infer<typeof ConversationSourceSchema>;
  text: string;
  assisted: boolean;
  interrupted: boolean;
  correctsMessageId: string | null;
  supersededByMessageId: string | null;
}

export interface VoiceMedicationDraft {
  drugId: string;
  dose: number | null;
  unit: string | null;
  route: string | null;
  source: "voice" | "text";
}

export interface ConversationSnapshot {
  runId: string;
  messages: ConversationMessage[];
  medicationDraft: VoiceMedicationDraft | null;
  live: {
    status: "disconnected" | "connecting" | "connected" | "interrupted" | "failed";
    sessionId: string | null;
  };
  examiner: {
    mode: "real" | "verification_fixture";
    model: string;
    sessionId: string | null;
    status: "idle" | "running" | "completed" | "unavailable";
    followUpDelivered: boolean;
    lastEvidenceCutoffSequence: number | null;
    message: string | null;
  };
}

export interface ConversationTurnResult {
  conversation: ConversationSnapshot;
  focusStation: "Medication" | null;
}
