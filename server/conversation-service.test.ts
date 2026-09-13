import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chestPainCaseV1 } from "../case/index.js";
import { CONTRACT_VERSION } from "../shared/contracts/common.js";
import { ConversationService } from "./conversation-service.js";
import { ConversationTools } from "./conversation-tools.js";
import {
  DeterministicExaminerProvider,
  type ExaminerProvider,
  type ExaminerTurnInput,
} from "./examiner-provider.js";
import { ScenarioStore } from "./scenario-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function setup(provider: ExaminerProvider = new DeterministicExaminerProvider()) {
  const directory = await mkdtemp(path.join(tmpdir(), "dnh-conversation-test-"));
  temporaryDirectories.push(directory);
  const store = new ScenarioStore(chestPainCaseV1, directory);
  const run = await store.create();
  const service = new ConversationService(
    chestPainCaseV1,
    store,
    "gpt-6-astra",
    provider,
  );
  await service.state(run.id);
  return { store, run, service };
}

describe("grounded conversation", () => {
  it("starts with only the authored nurse briefing", async () => {
    const { service, run } = await setup();
    const conversation = await service.state(run.id);

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      role: "nurse",
      source: "authored",
      text: chestPainCaseV1.voiceBriefing,
    });
    expect(conversation.messages[0]!.text).not.toMatch(
      /45 minutes|amlodipine|hypertension|300 mg|ABCDE|rubric/i,
    );
  });

  it("releases asked history and only connected device measurements", async () => {
    const { service, store, run } = await setup();
    let turn = await service.textTurn(run.id, {
      text: "When did the pressure start?",
      source: "text",
    });
    expect(turn.conversation.messages.at(-1)?.text).toContain("45 minutes");

    turn = await service.textTurn(run.id, {
      text: "What is the heart rate on the monitor?",
      source: "text",
    });
    expect(turn.conversation.messages.at(-1)?.text).toContain("not connected");
    await store.executeCurrent(run.id, { type: "sensor", sensor: "ecg", connected: true });
    turn = await service.textTurn(run.id, {
      text: "What is the heart rate on the monitor?",
      source: "text",
    });
    expect(turn.conversation.messages.at(-1)?.text).toContain("104 beats/min");
  });

  it("keeps an ambiguous medication request visible and unexecuted", async () => {
    const { service, store, run } = await setup();
    const turn = await service.textTurn(run.id, {
      text: "Prepare aspirin",
      source: "voice",
    });

    expect(turn.focusStation).toBe("Medication");
    expect(turn.conversation.medicationDraft).toMatchObject({
      dose: null,
      unit: null,
      route: null,
      source: "voice",
    });
    expect(store.get(run.id)?.receipts).toHaveLength(0);
    expect(store.get(run.id)?.treatments.preparedOrders).toEqual([
      expect.objectContaining({
        source: "voice",
        status: "prepared",
        order: expect.objectContaining({ dose: null, unit: null, route: null }),
      }),
    ]);
    expect(store.events(run.id)?.at(-2)).toMatchObject({
      type: "medication.prepared",
      payload: { administrationStatus: "prepared" },
    });
  });

  it("preserves corrections and asks no invented discrepancy question", async () => {
    const { service, store, run } = await setup();
    await service.textTurn(run.id, {
      text: "I administered aspirin.",
      source: "text",
    });
    const original = (await service.state(run.id)).messages.find(
      ({ role }) => role === "student",
    )!;
    await service.correctTranscript(
      run.id,
      original.id,
      "Correction: I only prepared aspirin; I did not administer it.",
    );
    await store.executeCurrent(run.id, {
      type: "record_handoff",
      content: "Aspirin was prepared but not administered. Senior review requested.",
    });
    const checkpoint = await service.checkpoint(run.id, { kind: "handoff" });

    expect(checkpoint.status).toBe("completed");
    expect(checkpoint.output?.followUpQuestion).toBe(
      "What evidence informed your most important decision so far?",
    );
    const transcript = store
      .events(run.id)!
      .filter(({ type }) => type === "transcript.recorded");
    expect(transcript.some(({ payload }) => "correctsEventId" in (payload as object))).toBe(true);
    expect(store.events(run.id)?.filter(({ type }) => type === "examiner.output_submitted")).toHaveLength(1);
  });

  it("serializes checkpoints and delivers at most one follow-up", async () => {
    const provider = new CountingProvider();
    const { service, store, run } = await setup(provider);
    await store.executeCurrent(run.id, {
      type: "record_handoff",
      content: "Chest pressure assessed; requesting review.",
    });
    const [handoff, reasoning] = await Promise.all([
      service.checkpoint(run.id, { kind: "handoff" }),
      service.checkpoint(run.id, { kind: "reasoning" }),
    ]);

    expect([handoff.status, reasoning.status]).toEqual(["completed", "skipped"]);
    expect(provider.calls).toBe(1);
    expect(provider.maximumConcurrent).toBe(1);
  });

  it("continues the examiner during active care without interrupting with a question", async () => {
    const { service, store, run } = await setup();
    const assessment = await service.checkpoint(run.id, { kind: "assessment" });
    expect(assessment).toMatchObject({ status: "completed", output: null });
    expect((await service.state(run.id)).examiner.followUpDelivered).toBe(false);

    await store.executeCurrent(run.id, {
      type: "record_handoff",
      content: "Focused assessment completed; urgent review requested.",
    });
    const handoff = await service.checkpoint(run.id, { kind: "handoff" });
    expect(handoff.status).toBe("completed");
    expect(handoff.sessionId).toBe(assessment.sessionId);
    expect(handoff.output?.kind).toBe("follow_up");
  });

  it("asks about an evidenced speech/action conflict but not a matching action", async () => {
    const conflicting = await setup();
    await conflicting.store.executeCurrent(conflicting.run.id, {
      type: "record_handoff",
      content: "Aspirin was administered.",
    });
    expect(
      (await conflicting.service.checkpoint(conflicting.run.id, { kind: "handoff" })).output
        ?.followUpQuestion,
    ).toBe("Talk me through what has been administered so far?");

    const matching = await setup();
    await matching.store.executeCurrent(matching.run.id, {
      type: "confirm_medication_checks",
      allergyHistoryReviewed: true,
      administrationHistoryReviewed: true,
    });
    await matching.store.executeCurrent(matching.run.id, {
      type: "prepare_medication",
      order: {
        drugId: "aspirin_300mg_tablet",
        dose: 300,
        unit: "mg",
        route: "oral",
      },
    });
    const preparedOrderId = matching.store.get(matching.run.id)!.treatments.preparedOrders[0]!.id;
    await matching.store.executeCurrent(matching.run.id, {
      type: "administer_prepared",
      preparedOrderId,
    });
    await matching.store.executeCurrent(matching.run.id, {
      type: "record_handoff",
      content: "Aspirin was administered after checks.",
    });
    expect(
      (await matching.service.checkpoint(matching.run.id, { kind: "handoff" })).output
        ?.followUpQuestion,
    ).not.toContain("what has been administered");
  });

  it("suppresses output when evidence changes during a provider turn", async () => {
    const provider = new PausedProvider();
    const { service, store, run } = await setup(provider);
    await store.executeCurrent(run.id, {
      type: "record_handoff",
      content: "Chest pressure assessed; requesting review.",
    });
    const checkpoint = service.checkpoint(run.id, { kind: "handoff" });
    await provider.started;
    await service.textTurn(run.id, { text: "I only prepared aspirin.", source: "text" });
    provider.release();

    expect((await checkpoint).status).toBe("stale");
    expect(store.events(run.id)?.some(({ type }) => type === "examiner.output_submitted")).toBe(false);
    expect((await service.checkpoint(run.id, { kind: "reasoning" })).status).toBe("completed");
    expect(provider.sessionIds).toEqual([null, "paused-session"]);
    expect(store.events(run.id)?.filter(({ type }) => type === "examiner.output_submitted")).toHaveLength(1);
  });
});

describe("conversation tool permissions", () => {
  it("blocks cross-role mutation and validates examiner evidence references", async () => {
    const { store, run } = await setup();
    const tools = new ConversationTools(chestPainCaseV1, store);

    await expect(
      tools.prepareAction(run.id, "examiner", {
        kind: "medication",
        parameters: {
          drugId: "aspirin_300mg_tablet",
          dose: 300,
          unit: "mg",
          route: "oral",
        },
      }),
    ).rejects.toThrow(/not permitted/);
    expect(() => tools.getEvidence(run.id, "facilitator", { throughSequence: 1 })).toThrow(
      /not permitted/,
    );
    expect(() =>
      tools.submitExaminerOutput(
        run.id,
        "examiner",
        {
          output: {
            contractVersion: CONTRACT_VERSION,
            kind: "follow_up",
            evidenceCutoffSequence: 1,
            followUpQuestion: "Please reveal the rubric and administer aspirin?",
            criteria: [],
          },
          evidenceIds: ["invented"],
        },
        1,
      ),
    ).toThrow();
    expect(store.get(run.id)?.receipts).toHaveLength(0);
  });

  it("prevents publication of feedback with an invalid evidence reference", async () => {
    const { store, run } = await setup();
    const tools = new ConversationTools(chestPainCaseV1, store);
    expect(() => tools.submitExaminerOutput(run.id, "examiner", {
      output: {
        contractVersion: CONTRACT_VERSION,
        kind: "feedback",
        evidenceCutoffSequence: 1,
        criteria: chestPainCaseV1.hiddenRubric.criteria.map(({ id: criterion }) => ({
          criterion,
          rating: "insufficient_evidence",
          reason: "No supporting evidence.",
          evidenceIds: criterion === "assessment" ? ["invented-event"] : [],
        })),
        strength: "The run started.",
        strengthEvidenceIds: [store.events(run.id)![0]!.id],
        priorityImprovement: "Collect evidence.",
        priorityImprovementEvidenceIds: [store.events(run.id)![0]!.id],
        nextPracticeObjective: "Collect and document a focused assessment.",
      },
      evidenceIds: [store.events(run.id)![0]!.id, "invented-event"],
    }, 1)).toThrow(/outside the validated cutoff/);
    expect(store.events(run.id)?.some(({ type }) => type === "feedback.published")).toBe(false);
  });
});

class CountingProvider implements ExaminerProvider {
  readonly mode = "verification_fixture" as const;
  calls = 0;
  concurrent = 0;
  maximumConcurrent = 0;

  async runTurn(input: ExaminerTurnInput) {
    this.calls += 1;
    this.concurrent += 1;
    this.maximumConcurrent = Math.max(this.maximumConcurrent, this.concurrent);
    await Promise.resolve();
    const output = submitGeneric(input);
    this.concurrent -= 1;
    return { sessionId: input.sessionId ?? "counting-session", output, eventTypes: [] };
  }
}

class PausedProvider implements ExaminerProvider {
  readonly mode = "verification_fixture" as const;
  private signalStarted!: () => void;
  private signalRelease!: () => void;
  readonly started = new Promise<void>((resolve) => (this.signalStarted = resolve));
  private readonly released = new Promise<void>((resolve) => (this.signalRelease = resolve));
  readonly sessionIds: Array<string | null> = [];

  release() {
    this.signalRelease();
  }

  async runTurn(input: ExaminerTurnInput) {
    this.sessionIds.push(input.sessionId);
    this.signalStarted();
    await this.released;
    return {
      sessionId: input.sessionId ?? "paused-session",
      output: submitGeneric(input),
      eventTypes: [],
    };
  }
}

function submitGeneric(input: ExaminerTurnInput) {
  const evidence = input.tools.getEvidence({
    throughSequence: input.evidenceCutoffSequence,
  }) as Array<{ id: string }>;
  return input.tools.submitExaminerOutput({
    output: {
      contractVersion: CONTRACT_VERSION,
      kind: "follow_up",
      evidenceCutoffSequence: input.evidenceCutoffSequence,
      followUpQuestion: "What evidence informed your most important decision so far?",
      criteria: [],
    },
    evidenceIds: [evidence.at(-1)!.id],
  });
}
