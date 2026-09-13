import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chestPainCaseV1 } from "../case/index.js";
import { CONTRACT_VERSION } from "../shared/contracts/common.js";
import { ConversationService } from "./conversation-service.js";
import { DebriefService } from "./debrief-service.js";
import { DeterministicExaminerProvider, type ExaminerProvider, type ExaminerTurnInput } from "./examiner-provider.js";
import { ScenarioStore } from "./scenario-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(provider: ExaminerProvider = new DeterministicExaminerProvider()) {
  const directory = await mkdtemp(path.join(tmpdir(), "dnh-debrief-test-"));
  temporaryDirectories.push(directory);
  const store = new ScenarioStore(chestPainCaseV1, directory);
  const run = await store.create();
  const conversation = new ConversationService(chestPainCaseV1, store, "gpt-6-astra", provider);
  await conversation.state(run.id);
  const debrief = new DebriefService(chestPainCaseV1, store, conversation);
  return { store, run, conversation, debrief };
}

async function handoff(store: ScenarioStore, runId: string) {
  await store.executeCurrent(runId, { type: "record_handoff", content: "Chest pain assessed; please review urgently." });
}

describe("visual debrief and evidence cutoff", () => {
  it("settles an accepted action, final note, and buffered transcript before the named cutoff", async () => {
    const { store, run, debrief } = await setup();
    await handoff(store, run.id);
    const accepted = store.executeCurrent(run.id, { type: "perform_assessment", findingId: "airway_assessment" });
    const finished = debrief.finish(run.id, {
      noteContent: "Airway patent. Chest pain under assessment. Senior review requested.",
      pendingTranscript: "I am checking the current observations before handoff.",
    });
    await accepted;
    const result = await finished;

    expect(store.get(run.id)).toMatchObject({ lifecycle: "ended", clock: { running: false } });
    expect(result).toMatchObject({ status: "ready", cutoffName: "finish-v1", transcriptDrain: { status: "flushed" } });
    const throughCutoff = store.events(run.id)!.filter(({ sequence }) => sequence <= result.evidenceCutoffSequence);
    expect(throughCutoff.map(({ type }) => type)).toEqual(expect.arrayContaining(["assessment.performed", "note.saved", "transcript.recorded", "session.ended"]));
    expect(throughCutoff.at(-1)).toMatchObject({ type: "session.ended", sequence: result.evidenceCutoffSequence });
    expect(result.evidence.map(({ id }) => id)).toEqual(throughCutoff.map(({ id }) => id));
    expect(result.feedbackRevisions[0]?.output.criteria).toHaveLength(6);
  });

  it("resolves every citation and never charts prepared or blocked medication as a dose", async () => {
    const { store, run, debrief } = await setup();
    await store.executeCurrent(run.id, {
      type: "prepare_medication",
      order: { drugId: "aspirin_300mg_tablet", dose: 600, unit: "mg", route: "oral" },
    });
    const prepared = store.get(run.id)!.treatments.preparedOrders[0]!;
    await store.executeCurrent(run.id, { type: "administer_prepared", preparedOrderId: prepared.id });
    await handoff(store, run.id);
    const result = await debrief.finish(run.id, {});
    const feedback = result.feedbackRevisions[0]!.output;
    const known = new Set(result.evidence.map(({ id }) => id));
    const cited = feedback.criteria.flatMap(({ evidenceIds }) => evidenceIds)
      .concat(feedback.strengthEvidenceIds!, feedback.priorityImprovementEvidenceIds!);

    expect(cited.every((id) => known.has(id))).toBe(true);
    expect(result.markers.filter(({ kind }) => kind === "treatment")).toHaveLength(0);
    expect(result.actions.some(({ status }) => status === "prepared")).toBe(true);
    expect(result.actions.some(({ status }) => status === "blocked")).toBe(true);
  });

  it("places only accepted administration receipts on the treatment chart", async () => {
    const { store, run, debrief } = await setup();
    await store.executeCurrent(run.id, { type: "confirm_medication_checks", allergyHistoryReviewed: true, administrationHistoryReviewed: true });
    await store.executeCurrent(run.id, { type: "prepare_medication", order: { drugId: "aspirin_300mg_tablet", dose: 300, unit: "mg", route: "oral" } });
    await store.executeCurrent(run.id, { type: "administer_prepared", preparedOrderId: store.get(run.id)!.treatments.preparedOrders[0]!.id });
    await handoff(store, run.id);
    const result = await debrief.finish(run.id, {});
    const treatmentMarkers = result.markers.filter(({ kind }) => kind === "treatment");
    expect(treatmentMarkers.map(({ eventId }) => eventId)).toEqual(store.get(run.id)!.receipts.map(({ id }) => id));
    expect(treatmentMarkers[0]?.label).toContain("300 mg oral");
  });

  it("uses insufficient evidence instead of inventing missing performance", async () => {
    const { store, run, debrief } = await setup();
    await handoff(store, run.id);
    const result = await debrief.finish(run.id, {});
    const ratings = Object.fromEntries(result.feedbackRevisions[0]!.output.criteria.map((item) => [item.criterion, item.rating]));
    expect(ratings).toMatchObject({
      assessment: "insufficient_evidence",
      interpretation: "insufficient_evidence",
      intervention_selection_dosing: "insufficient_evidence",
      reassessment: "insufficient_evidence",
    });
  });

  it("preserves the original cutoff and labels regenerated feedback after a late correction", async () => {
    const { store, run, conversation, debrief } = await setup();
    await conversation.textTurn(run.id, { text: "I administered aspirin.", source: "text" });
    const original = (await conversation.state(run.id)).messages.find(({ role }) => role === "student")!;
    await handoff(store, run.id);
    const first = await debrief.finish(run.id, {});
    await conversation.correctTranscript(run.id, original.id, "Correction: aspirin was prepared, not administered.");
    const revised = await debrief.retry(run.id);

    expect(revised.feedbackRevisions).toHaveLength(2);
    expect(revised.feedbackRevisions[0]).toMatchObject({ cutoffName: "finish-v1", evidenceCutoffSequence: first.evidenceCutoffSequence });
    expect(revised.feedbackRevisions[1]?.label).toContain("late evidence");
    expect(revised.feedbackRevisions[1]!.evidenceCutoffSequence).toBeGreaterThan(first.evidenceCutoffSequence);
    expect(revised.evidence.find(({ id }) => id === original.eventId)?.superseded).toBe(true);
  });

  it("retains evidence after evaluator failure and succeeds on retry", async () => {
    const provider = new RecoveringProvider();
    const { store, run, debrief } = await setup(provider);
    await handoff(store, run.id);
    const unavailable = await debrief.finish(run.id, {});
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.evidence.length).toBeGreaterThan(0);
    const recovered = await debrief.retry(run.id);
    expect(recovered.status).toBe("ready");
    expect(recovered.feedbackRevisions[0]?.trigger).toBe("retry");
    expect(recovered.evidenceCutoffSequence).toBe(unavailable.evidenceCutoffSequence);
  });

  it("marks optional teach-back as assisted", async () => {
    const { store, run, conversation, debrief } = await setup();
    await handoff(store, run.id);
    await debrief.finish(run.id, {});
    const result = await debrief.requestTeachBack(run.id);
    expect(result.teachBack?.assisted).toBe(true);
    expect((await conversation.state(run.id)).messages.at(-1)).toMatchObject({ role: "examiner", assisted: true });
  });
});

class RecoveringProvider implements ExaminerProvider {
  readonly mode = "verification_fixture" as const;
  attempts = 0;

  async runTurn(input: ExaminerTurnInput) {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error("deliberate evaluator outage");
    const evidence = input.tools.getEvidence({ throughSequence: input.evidenceCutoffSequence }) as Array<{ id: string }>;
    const id = evidence[0]!.id;
    const criteria = chestPainCaseV1.hiddenRubric.criteria.map(({ id: criterion }) => ({
      criterion,
      rating: "insufficient_evidence" as const,
      reason: "The retained evidence does not support this criterion.",
      evidenceIds: [],
    }));
    const output = input.tools.submitExaminerOutput({
      output: {
        contractVersion: CONTRACT_VERSION,
        kind: "feedback",
        evidenceCutoffSequence: input.evidenceCutoffSequence,
        criteria,
        strength: "The run was brought to an explicit handoff.",
        strengthEvidenceIds: [id],
        priorityImprovement: "Record more direct performance evidence.",
        priorityImprovementEvidenceIds: [id],
        nextPracticeObjective: "Record assessment, intervention, and reassessment before handoff.",
      },
      evidenceIds: [id],
    });
    return { sessionId: "recovered-session", output, eventTypes: [] };
  }
}
