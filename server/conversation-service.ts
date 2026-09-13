import { randomUUID } from "node:crypto";
import type {
  ConversationMessage,
  ConversationSnapshot,
  ConversationTurnResult,
} from "../shared/contracts/conversation.js";
import type { RunEvent } from "../shared/contracts/common.js";
import type { CasePack, ExaminerOutput } from "../shared/contracts/server.js";
import { ConversationTools } from "./conversation-tools.js";
import type { ExaminerProvider } from "./examiner-provider.js";
import { ScenarioStore } from "./scenario-store.js";

interface ManagedConversation {
  snapshot: ConversationSnapshot;
  examinerSessionId: string | null;
  checkpointQueue: Promise<void>;
  awaitingAssistedAnswer: boolean;
}

export interface CheckpointResult {
  status: "completed" | "skipped" | "stale" | "unavailable";
  message: string;
  sessionId: string | null;
  output: ExaminerOutput | null;
}

export class ConversationService {
  private readonly conversations = new Map<string, ManagedConversation>();
  private readonly initializing = new Map<string, Promise<ManagedConversation>>();
  private readonly tools: ConversationTools;

  constructor(
    private readonly casePack: CasePack,
    private readonly store: ScenarioStore,
    private readonly examinerModel: string,
    private readonly examinerProvider: ExaminerProvider,
  ) {
    this.tools = new ConversationTools(casePack, store);
  }

  async state(runId: string) {
    const managed = await this.ensure(runId);
    return structuredClone(managed.snapshot);
  }

  async textTurn(
    runId: string,
    input: { text: string; source: "voice" | "text"; interrupted?: boolean },
  ): Promise<ConversationTurnResult> {
    const managed = await this.ensure(runId);
    const student = await this.recordMessage(managed, {
      role: "student",
      source: input.source,
      text: input.text.trim(),
      assisted: managed.awaitingAssistedAnswer,
      interrupted: input.interrupted ?? false,
      correctsMessageId: null,
    });
    if (managed.awaitingAssistedAnswer) managed.awaitingAssistedAnswer = false;

    const factKey = matchCaseFact(input.text);
    if (factKey) {
      const fact = await this.tools.getCaseFact(runId, "facilitator", { key: factKey });
      const value = fact.available
        ? `${String(fact.value)}${fact.unit ? ` ${fact.unit}` : ""}`
        : "I don't have that information available right now.";
      await this.recordMessage(
        managed,
        responseMessage(fact.role ?? "patient", input.source, value),
        student.eventId,
      );
      return { conversation: structuredClone(managed.snapshot), focusStation: null };
    }

    if (isVisibleStateQuestion(input.text)) {
      const visible = this.tools.getVisibleState(runId, "facilitator");
      const answer = visibleAnswer(input.text, visible);
      await this.recordMessage(
        managed,
        responseMessage("nurse", input.source, answer),
        student.eventId,
      );
      return { conversation: structuredClone(managed.snapshot), focusStation: null };
    }

    const draftRequest = parseMedicationDraft(input.text, this.casePack);
    if (draftRequest) {
      const draft = await this.tools.prepareAction(
        runId,
        "facilitator",
        { kind: "medication", parameters: draftRequest },
        input.source,
      );
      managed.snapshot.medicationDraft = { ...draft.order, source: input.source };
      await this.recordMessage(
        managed,
        responseMessage(
          "nurse",
          input.source,
          "Medication draft opened for review. Missing parameters remain unset; nothing has been administered.",
        ),
        student.eventId,
      );
      return {
        conversation: structuredClone(managed.snapshot),
        focusStation: "Medication",
      };
    }

    await this.recordMessage(
      managed,
      responseMessage(
        "patient",
        input.source,
        "I can answer about how I feel; use the bedside controls for examinations and treatment.",
      ),
      student.eventId,
    );
    return { conversation: structuredClone(managed.snapshot), focusStation: null };
  }

  async correctTranscript(runId: string, messageId: string, text: string) {
    const managed = await this.ensure(runId);
    const original = managed.snapshot.messages.find(
      (message) => message.id === messageId && message.role === "student",
    );
    if (!original) throw new Error("Student transcript segment not found");
    if (original.supersededByMessageId) throw new Error("Transcript segment is already superseded");
    const correction = await this.recordMessage(
      managed,
      {
        role: "student",
        source: original.source === "authored" ? "text" : original.source,
        text: text.trim(),
        assisted: original.assisted,
        interrupted: false,
        correctsMessageId: original.id,
      },
      original.eventId,
    );
    original.supersededByMessageId = correction.id;
    return structuredClone(managed.snapshot);
  }

  async clearMedicationDraft(runId: string) {
    const managed = await this.ensure(runId);
    managed.snapshot.medicationDraft = null;
    return structuredClone(managed.snapshot);
  }

  async registerLiveSession(runId: string, sessionId: string) {
    const managed = await this.ensure(runId);
    managed.snapshot.live = { status: "connected", sessionId };
  }

  async setLiveStatus(
    runId: string,
    sessionId: string,
    status: "connected" | "interrupted" | "disconnected" | "failed",
  ) {
    const managed = await this.ensure(runId);
    if (managed.snapshot.live.sessionId !== sessionId) return false;
    managed.snapshot.live.status = status;
    if (status === "disconnected" || status === "failed")
      managed.snapshot.live.sessionId = null;
    return true;
  }

  async invokeLiveTool(
    runId: string,
    sessionId: string,
    name: string,
    input: unknown,
  ) {
    const managed = await this.ensure(runId);
    if (managed.snapshot.live.sessionId !== sessionId)
      throw new Error("Live session does not match this run");
    if (name === "get_case_fact")
      return this.tools.getCaseFact(runId, "facilitator", input);
    if (name === "get_visible_state")
      return this.tools.getVisibleState(runId, "facilitator");
    if (name === "prepare_action")
      return this.tools.prepareAction(runId, "facilitator", input, "voice");
    throw new Error(`Tool ${name} is not permitted for the facilitator`);
  }

  async checkpoint(
    runId: string,
    input: {
      kind: "assessment" | "treatment" | "handoff" | "reasoning" | "debrief";
    },
  ): Promise<CheckpointResult> {
    const managed = await this.ensure(runId);
    let result: CheckpointResult | undefined;
    const operation = managed.checkpointQueue.then(async () => {
      result = await this.runCheckpoint(runId, managed, input.kind);
    });
    managed.checkpointQueue = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  private async runCheckpoint(
    runId: string,
    managed: ManagedConversation,
    kind: "assessment" | "treatment" | "handoff" | "reasoning" | "debrief",
  ): Promise<CheckpointResult> {
    if (
      ["handoff", "reasoning"].includes(kind) &&
      managed.snapshot.examiner.followUpDelivered
    ) {
      return {
        status: "skipped",
        message: "The single follow-up for this run has already been delivered.",
        sessionId: managed.examinerSessionId,
        output: null,
      };
    }
    if (kind === "handoff" && !this.store.get(runId)?.handoffs.length) {
      return {
        status: "skipped",
        message: "Record a handoff before requesting the handoff checkpoint.",
        sessionId: managed.examinerSessionId,
        output: null,
      };
    }
    await this.store.recordEvidence(runId, "system", "examiner.checkpoint_started", {
      kind,
    });
    const evidence = this.store.events(runId) ?? [];
    const cutoff = evidence.at(-1)?.sequence ?? 0;
    if (cutoff < 1) throw new Error("Run has no evidence");
    managed.snapshot.examiner.status = "running";
    managed.snapshot.examiner.message = "Examiner is reviewing the current evidence checkpoint.";
    try {
      const providerResult = await this.examinerProvider.runTurn({
        sessionId: managed.examinerSessionId,
        model: this.examinerModel,
        checkpoint: kind,
        evidenceCutoffSequence: cutoff,
        tools: {
          getEvidence: (toolInput) =>
            this.tools.getEvidence(runId, "examiner", toolInput),
          submitExaminerOutput: (toolInput) =>
            this.tools.submitExaminerOutput(runId, "examiner", toolInput, cutoff),
        },
      });
      managed.examinerSessionId = providerResult.sessionId;
      const latestSequence = this.store.events(runId)?.at(-1)?.sequence ?? 0;
      if (latestSequence !== cutoff) {
        managed.snapshot.examiner.status = "idle";
        managed.snapshot.examiner.message =
          "Evidence changed during review; stale examiner output was suppressed.";
        return {
          status: "stale",
          message: managed.snapshot.examiner.message,
          sessionId: managed.examinerSessionId,
          output: null,
        };
      }
      if (!providerResult.output) {
        managed.snapshot.examiner.status = "completed";
        managed.snapshot.examiner.lastEvidenceCutoffSequence = cutoff;
        managed.snapshot.examiner.message =
          "Examiner session continued without interrupting active treatment.";
        return {
          status: "completed",
          message: managed.snapshot.examiner.message,
          sessionId: managed.examinerSessionId,
          output: null,
        };
      }
      const outputEvent = await this.store.recordEvidence(
        runId,
        "examiner",
        "examiner.output_submitted",
        {
          kind: providerResult.output.kind,
          evidenceCutoffSequence: cutoff,
          followUpQuestion: providerResult.output.followUpQuestion ?? null,
          providerMode: this.examinerProvider.mode,
        },
      );
      await this.recordMessage(
        managed,
        {
          role: "examiner",
          source: "text",
          text: providerResult.output.followUpQuestion!,
          assisted: false,
          interrupted: false,
          correctsMessageId: null,
        },
        outputEvent?.id,
      );
      managed.snapshot.examiner = {
        ...managed.snapshot.examiner,
        sessionId: null,
        status: "completed",
        followUpDelivered: true,
        lastEvidenceCutoffSequence: cutoff,
        message: "One grounded follow-up delivered.",
      };
      managed.awaitingAssistedAnswer = true;
      return {
        status: "completed",
        message: "One grounded follow-up delivered.",
        sessionId: managed.examinerSessionId,
        output: providerResult.output,
      };
    } catch (error) {
      managed.snapshot.examiner.status = "unavailable";
      managed.snapshot.examiner.message =
        error instanceof Error ? `Evaluation unavailable: ${error.message}` : "Evaluation unavailable";
      return {
        status: "unavailable",
        message: managed.snapshot.examiner.message,
        sessionId: managed.examinerSessionId,
        output: null,
      };
    }
  }

  private async ensure(runId: string): Promise<ManagedConversation> {
    const existing = this.conversations.get(runId);
    if (existing) return existing;
    const pending = this.initializing.get(runId);
    if (pending) return pending;
    const initialization = this.initialize(runId);
    this.initializing.set(runId, initialization);
    try {
      return await initialization;
    } finally {
      this.initializing.delete(runId);
    }
  }

  private async initialize(runId: string) {
    if (!this.store.get(runId)) throw new Error("Scenario session not found");
    const managed: ManagedConversation = {
      snapshot: {
        runId,
        messages: [],
        medicationDraft: null,
        live: { status: "disconnected", sessionId: null },
        examiner: {
          mode: this.examinerProvider.mode,
          model: this.examinerModel,
          sessionId: null,
          status: "idle",
          followUpDelivered: false,
          lastEvidenceCutoffSequence: null,
          message: null,
        },
      },
      examinerSessionId: null,
      checkpointQueue: Promise.resolve(),
      awaitingAssistedAnswer: false,
    };
    this.conversations.set(runId, managed);
    await this.recordMessage(managed, {
      role: "nurse",
      source: "authored",
      text: this.casePack.voiceBriefing,
      assisted: false,
      interrupted: false,
      correctsMessageId: null,
    });
    return managed;
  }

  private async recordMessage(
    managed: ManagedConversation,
    message: Omit<ConversationMessage, "id" | "eventId" | "supersededByMessageId">,
    causedBy?: string,
    recordEvidence = true,
  ): Promise<ConversationMessage> {
    const id = randomUUID();
    let event: RunEvent | null = null;
    if (recordEvidence) {
      const corrects = message.correctsMessageId
        ? managed.snapshot.messages.find(({ id: candidate }) => candidate === message.correctsMessageId)
        : undefined;
      event = await this.store.recordEvidence(
        managed.snapshot.runId,
        message.role,
        "transcript.recorded",
        {
          messageId: id,
          role: message.role,
          source: message.source,
          text: message.text,
          assisted: message.assisted,
          interrupted: message.interrupted,
          ...(corrects ? { correctsEventId: corrects.eventId } : {}),
        },
        causedBy ? { causedBy } : {},
      );
    }
    const complete: ConversationMessage = {
      ...message,
      id,
      eventId: event?.id ?? causedBy ?? id,
      supersededByMessageId: null,
    };
    managed.snapshot.messages.push(complete);
    return complete;
  }
}

function responseMessage(
  role: "patient" | "nurse",
  source: "voice" | "text",
  text: string,
) {
  return {
    role,
    source,
    text,
    assisted: false,
    interrupted: false,
    correctsMessageId: null,
  } as const;
}

function matchCaseFact(text: string) {
  const normalized = text.toLowerCase();
  if (/when|start|onset|how long/.test(normalized)) return "symptom_onset";
  if (/radiat|spread|character|feel like/.test(normalized)) return "pain_character_radiation";
  if (/nause|sweat|associated|faint/.test(normalized)) return "associated_symptoms";
  if (/allerg/.test(normalized)) return "allergy_history";
  if (/medication|medicine|tablets|prior dose/.test(normalized)) return "medication_history";
  if (/medical history|condition|hypertension|smok/.test(normalized)) return "medical_history";
  if (/pain.*score|out of 10|severity/.test(normalized)) return "pain_score";
  if (/airway/.test(normalized)) return "airway_assessment";
  if (/breath|respirat/.test(normalized)) return "breathing_assessment";
  if (/perfusion|capillary|assess.*pulse/.test(normalized)) return "perfusion_assessment";
  if (/conscious|orient|alert/.test(normalized)) return "consciousness_assessment";
  return null;
}

function isVisibleStateQuestion(text: string) {
  return /heart rate|pulse|monitor|oxygen saturation|spo2|blood pressure|respiratory rate|result|ecg|troponin|administered|given/i.test(
    text,
  );
}

function visibleAnswer(text: string, visible: ReturnType<ConversationTools["getVisibleState"]>) {
  if (/heart rate|pulse/i.test(text))
    return visible.measurements.hr === null
      ? "ECG leads are not connected, so no heart rate is currently visible."
      : `The monitor shows a heart rate of ${visible.measurements.hr} beats/min.`;
  if (/oxygen saturation|spo2/i.test(text))
    return visible.measurements.spo2 === null
      ? "The SpO₂ probe is not connected, so no oxygen saturation is currently visible."
      : `The monitor shows an oxygen saturation of ${visible.measurements.spo2}%.`;
  if (/blood pressure/i.test(text))
    return visible.measurements.bp
      ? `The last blood pressure is ${visible.measurements.bp.value}.`
      : "No blood pressure measurement has been taken yet.";
  if (/administered|given/i.test(text))
    return visible.medication.administrations.length
      ? `${visible.medication.administrations.length} medication administration receipt is visible.`
      : "There are no medication administration receipts. Prepared orders have not been administered.";
  if (/result|ecg|troponin/i.test(text)) {
    const displayed = visible.investigations.filter(({ status }) => status === "displayed");
    return displayed.length
      ? displayed.map(({ label, result, report }) => `${label}: ${result ?? report}`).join(" ")
      : "No investigation result has been displayed yet.";
  }
  return `The visible respiratory rate is ${visible.measurements.rr} breaths/min.`;
}

function parseMedicationDraft(text: string, casePack: CasePack) {
  if (!/\b(prepare|order|give|administer)\b/i.test(text)) return null;
  const medication = casePack.medicationRules.find(({ name }) =>
    text.toLowerCase().includes(name.toLowerCase()),
  );
  if (!medication) return null;
  const doseMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(mg|g)\b/i);
  const route = medication.allowedRoutes.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(text),
  );
  return {
    drugId: medication.id,
    dose: doseMatch ? Number(doseMatch[1]) : null,
    unit: doseMatch?.[2] ?? null,
    route: route ?? null,
  };
}
