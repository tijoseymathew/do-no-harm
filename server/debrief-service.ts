import { CONTRACT_VERSION, type RunEvent } from "../shared/contracts/common.js";
import {
  DebriefSnapshotSchema,
  type DebriefSnapshot,
  type EvidenceCard,
  type FinishRunInput,
} from "../shared/contracts/debrief.js";
import type { CasePack } from "../shared/contracts/server.js";
import type { ScenarioSnapshot } from "../shared/contracts/scenario.js";
import { ConversationService } from "./conversation-service.js";
import { ScenarioStore } from "./scenario-store.js";

const TRANSCRIPT_DRAIN_TIMEOUT_MS = 750;

export class DebriefService {
  private readonly debriefs = new Map<string, DebriefSnapshot>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly casePack: CasePack,
    private readonly store: ScenarioStore,
    private readonly conversation: ConversationService,
  ) {}

  get(runId: string) {
    const value = this.debriefs.get(runId);
    return value ? structuredClone(value) : null;
  }

  async finish(runId: string, input: FinishRunInput) {
    return this.serialize(runId, async () => {
      const existing = this.debriefs.get(runId);
      if (existing) return structuredClone(existing);
      let state = this.requireRun(runId);
      if (!state.handoffs.length) throw new Error("Record a handoff before finishing the run.");

      if (state.clock.running) {
        const paused = await this.store.executeCurrent(runId, { type: "pause" });
        if (!paused || paused.rejection) throw new Error(paused?.rejection?.message ?? "Unable to freeze run");
        state = paused.state;
      }
      const note = input.noteContent?.trim();
      if (note && state.notes.at(-1)?.content !== note) {
        const saved = await this.store.executeCurrent(runId, { type: "save_note", content: note });
        if (!saved || saved.rejection) throw new Error(saved?.rejection?.message ?? "Unable to save final note");
      }
      const transcriptDrain = await this.conversation.flushPendingTranscript(
        runId,
        input.pendingTranscript,
        TRANSCRIPT_DRAIN_TIMEOUT_MS,
      );
      const finished = await this.store.executeCurrent(runId, { type: "finish" });
      if (!finished || finished.rejection) throw new Error(finished?.rejection?.message ?? "Unable to finish run");
      const ended = this.store.events(runId)!.findLast(({ type }) => type === "session.ended")!;
      const cutoffName = String((ended.payload as Record<string, unknown>).cutoffName);
      const snapshot = this.reconstruct(
        runId,
        ended.sequence,
        cutoffName,
        transcriptDrain,
        [],
        "evaluating",
        "Generating grounded formative feedback…",
      );
      this.save(snapshot);
      return this.evaluate(snapshot, "finish");
    });
  }

  async retry(runId: string) {
    return this.serialize(runId, async () => {
      const current = this.requireDebrief(runId);
      const substantive = (this.store.events(runId) ?? []).filter(
        (event) =>
          event.sequence > current.evidenceCutoffSequence &&
          !["examiner.checkpoint_started", "examiner.output_submitted", "feedback.published", "feedback.unavailable", "teach_back.requested"].includes(event.type),
      );
      let cutoff = current.evidenceCutoffSequence;
      let cutoffName = current.cutoffName;
      let trigger: "late_evidence" | "retry" = "retry";
      if (substantive.length) {
        trigger = "late_evidence";
        const named = await this.store.recordEvidence(runId, "system", "evidence.cutoff_named", {
          cutoffName: `late-evidence-v${current.feedbackRevisions.length + 1}`,
          priorCutoffName: current.cutoffName,
          priorEvidenceCutoffSequence: current.evidenceCutoffSequence,
        });
        cutoff = named!.sequence;
        cutoffName = String((named!.payload as Record<string, unknown>).cutoffName);
      }
      const rebuilt = this.reconstruct(
        runId,
        cutoff,
        cutoffName,
        current.transcriptDrain,
        current.feedbackRevisions,
        "evaluating",
        trigger === "late_evidence"
          ? "Regenerating feedback from a new late-evidence cutoff…"
          : "Retrying evaluation against the retained evidence cutoff…",
      );
      this.save(rebuilt);
      return this.evaluate(rebuilt, trigger);
    });
  }

  async requestTeachBack(runId: string) {
    return this.serialize(runId, async () => {
      const current = this.requireDebrief(runId);
      const feedback = current.feedbackRevisions.find(
        ({ revision }) => revision === current.activeFeedbackRevision,
      );
      if (!feedback) throw new Error("Generate feedback before requesting teach-back.");
      if (current.teachBack) return structuredClone(current);
      const question = `Teach it back: how will you ${feedback.output.nextPracticeObjective!.replace(/^In the next case,\s*/i, "").replace(/\.$/, "")}?`;
      await this.conversation.deliverTeachBack(runId, question);
      current.teachBack = { question, requestedAt: new Date().toISOString(), assisted: true };
      this.save(current);
      return structuredClone(current);
    });
  }

  private async evaluate(
    current: DebriefSnapshot,
    trigger: "finish" | "late_evidence" | "retry",
  ) {
    const result = await this.conversation.checkpoint(current.runId, {
      kind: "debrief",
      evidenceCutoffSequence: current.evidenceCutoffSequence,
    });
    if (result.status !== "completed" || !result.output || result.output.kind !== "feedback") {
      current.status = "unavailable";
      current.evaluationMessage = result.message || "Evaluation unavailable. Evidence is retained; retry when ready.";
      await this.store.recordEvidence(current.runId, "system", "feedback.unavailable", {
        cutoffName: current.cutoffName,
        evidenceCutoffSequence: current.evidenceCutoffSequence,
        message: current.evaluationMessage,
      });
      this.save(current);
      return structuredClone(current);
    }
    const revision = current.feedbackRevisions.length + 1;
    current.feedbackRevisions.push({
      revision,
      label:
        trigger === "late_evidence"
          ? `Feedback revision ${revision} · late evidence`
          : `Feedback revision ${revision} · ${current.cutoffName}`,
      cutoffName: current.cutoffName,
      evidenceCutoffSequence: current.evidenceCutoffSequence,
      createdAt: new Date().toISOString(),
      trigger,
      output: result.output,
    });
    current.activeFeedbackRevision = revision;
    current.status = "ready";
    current.evaluationMessage = null;
    await this.store.recordEvidence(current.runId, "system", "feedback.published", {
      revision,
      cutoffName: current.cutoffName,
      evidenceCutoffSequence: current.evidenceCutoffSequence,
      trigger,
    });
    this.save(current);
    return structuredClone(current);
  }

  private reconstruct(
    runId: string,
    cutoff: number,
    cutoffName: string,
    transcriptDrain: DebriefSnapshot["transcriptDrain"],
    feedbackRevisions: DebriefSnapshot["feedbackRevisions"],
    status: DebriefSnapshot["status"],
    evaluationMessage: string | null,
  ): DebriefSnapshot {
    const events = (this.store.events(runId) ?? []).filter(({ sequence }) => sequence <= cutoff);
    const snapshots = this.store.snapshots(runId, cutoff) ?? [];
    const trendByTime = new Map<number, DebriefSnapshot["trend"][number]>();
    for (const { state } of snapshots) {
      trendByTime.set(state.simulationTimeMs, {
        simulationTimeMs: state.simulationTimeMs,
        heartRate: state.physiology.heartRate,
        spo2: state.physiology.spo2,
        respiratoryRate: state.physiology.respiratoryRate,
        systolicBp: state.physiology.systolicBp,
        diastolicBp: state.physiology.diastolicBp,
      });
    }
    const snapshot: DebriefSnapshot = {
      contractVersion: CONTRACT_VERSION,
      runId,
      formative: true,
      status,
      evaluationMessage,
      cutoffName,
      evidenceCutoffSequence: cutoff,
      transcriptDrain,
      trend: [...trendByTime.values()].sort((a, b) => a.simulationTimeMs - b.simulationTimeMs),
      markers: events.flatMap(markerFor),
      actions: events.flatMap(actionFor),
      evidence: evidenceCards(events, snapshots.at(-1)?.state ?? this.requireRun(runId)),
      feedbackRevisions: structuredClone(feedbackRevisions),
      activeFeedbackRevision: feedbackRevisions.at(-1)?.revision ?? null,
      teachBack: null,
    };
    return DebriefSnapshotSchema.parse(snapshot);
  }

  private save(snapshot: DebriefSnapshot) {
    const parsed = DebriefSnapshotSchema.parse(snapshot);
    this.debriefs.set(snapshot.runId, structuredClone(parsed));
    this.store.setDebrief(snapshot.runId, parsed);
  }

  private requireRun(runId: string) {
    const state = this.store.get(runId);
    if (!state) throw new Error("Scenario session not found");
    return state;
  }

  private requireDebrief(runId: string) {
    const current = this.debriefs.get(runId);
    if (!current) throw new Error("Finish the run before opening the debrief.");
    return current;
  }

  private async serialize<T>(runId: string, operation: () => Promise<T>) {
    const before = this.queues.get(runId) ?? Promise.resolve();
    let value!: T;
    const next = before.then(async () => {
      value = await operation();
    });
    this.queues.set(runId, next.catch(() => undefined));
    await next;
    return value;
  }
}

function markerFor(event: RunEvent): DebriefSnapshot["markers"] {
  const base = { eventId: event.id, simulationTimeMs: event.simulationTime };
  if (["assessment.performed", "observation.published", "investigation.displayed"].includes(event.type))
    return [{ ...base, kind: "assessment", label: eventLabel(event) }];
  if (event.type === "medication.administered")
    return [{ ...base, kind: "treatment", label: medicationLabel(event, true) }];
  if (["equipment.setting_changed", "fluid.started", "fluid.stopped"].includes(event.type))
    return [{ ...base, kind: "treatment", label: eventLabel(event) }];
  if (event.type === "branch.entered" && String(record(event.payload).branch) === "delayed_care")
    return [{ ...base, kind: "alarm", label: "Deterioration threshold" }];
  if (event.type === "senior.requested")
    return [{ ...base, kind: "escalation", label: "Senior contacted" }];
  return [];
}

function actionFor(event: RunEvent): DebriefSnapshot["actions"] {
  const status = event.type === "medication.attempted"
    ? "attempted"
    : event.type === "medication.blocked" || event.type === "command.rejected"
      ? "blocked"
      : event.type === "medication.prepared" || event.type === "action.drafted"
        ? "prepared"
        : ["assessment.performed", "investigation.interpreted", "medication.administered", "equipment.setting_changed", "fluid.started", "fluid.stopped", "note.saved", "senior.requested", "senior.acknowledged", "handoff.recorded"].includes(event.type)
          ? "completed"
          : null;
  return status
    ? [{ eventId: event.id, sequence: event.sequence, simulationTimeMs: event.simulationTime, status, label: eventLabel(event) }]
    : [];
}

function evidenceCards(events: RunEvent[], state: ScenarioSnapshot): EvidenceCard[] {
  const corrected = new Set(
    events.map(({ payload }) => record(payload).correctsEventId).filter((id): id is string => typeof id === "string"),
  );
  return events.flatMap((event) => {
    let kind: EvidenceCard["kind"] | null = null;
    if (event.type === "transcript.recorded") kind = "transcript_segment";
    else if (event.type === "note.saved") kind = "note_revision";
    else if (event.type === "medication.administered") kind = "medication_receipt";
    else if (["assessment.performed", "observation.published"].includes(event.type)) kind = "finding";
    else if (["investigation.displayed", "investigation.interpreted"].includes(event.type)) kind = "investigation";
    else if (actionFor(event).length || event.type === "handoff.recorded") kind = "action";
    if (!kind) return [];
    const payload = record(event.payload);
    let detail = JSON.stringify(payload, null, 2);
    if (kind === "medication_receipt") {
      const receipt = state.receipts.find(({ id }) => id === event.id);
      if (receipt) detail = JSON.stringify(receipt, null, 2);
    }
    if (kind === "investigation") {
      const investigation = state.investigations.find(({ id }) => id === payload.investigationId);
      if (investigation) detail = JSON.stringify({ event: payload, result: investigation.result, report: investigation.report, interpretations: investigation.interpretations }, null, 2);
    }
    return [{
      id: event.id,
      sequence: event.sequence,
      simulationTimeMs: event.simulationTime,
      kind,
      title: eventLabel(event),
      summary: summaryFor(event),
      detail,
      superseded: corrected.has(event.id),
      assisted: payload.assisted === true,
    }];
  });
}

function eventLabel(event: RunEvent) {
  const payload = record(event.payload);
  if (event.type.startsWith("medication.")) return medicationLabel(event, false);
  if (event.type === "note.saved") return `Note revision ${String(payload.revision)}`;
  if (event.type === "transcript.recorded") return `${String(payload.role ?? event.actor)} transcript segment`;
  if (event.type === "assessment.performed") return String(payload.label ?? payload.assessment ?? "Assessment performed");
  if (event.type === "observation.published") return `Observation: ${String(payload.observation ?? "published")}`;
  if (event.type === "investigation.interpreted") return "Investigation interpretation";
  if (event.type === "investigation.displayed") return `Investigation ${String(payload.view ?? "result")} opened`;
  if (event.type === "senior.requested") return "Senior review requested";
  if (event.type === "senior.acknowledged") return "Senior review acknowledged";
  if (event.type === "handoff.recorded") return "Structured handoff recorded";
  return event.type.replaceAll(".", " ");
}

function medicationLabel(event: RunEvent, includeParameters: boolean) {
  const payload = record(event.payload);
  const entered = record(payload.entered);
  const suffix = includeParameters
    ? ` ${String(entered.quantity ?? "?")} ${String(entered.unit ?? "")} ${String(entered.route ?? "route unset")}`
    : "";
  return `${String(payload.medicationId ?? "Medication")} ${String(payload.administrationStatus ?? event.type.split(".")[1])}${suffix}`;
}

function summaryFor(event: RunEvent) {
  const payload = record(event.payload);
  const value = payload.text ?? payload.content ?? payload.interpretation ?? payload.value ?? payload.message;
  return typeof value === "string" || typeof value === "number" ? String(value) : eventLabel(event);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
