import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chestPainCaseV1 } from "../case/chest-pain.v1.js";
import { ScenarioEngine } from "./scenario-engine.js";
import type { CasePack } from "../shared/contracts/server.js";
import type { ScenarioCommand } from "../shared/contracts/scenario.js";

function harness(casePack: CasePack = chestPainCaseV1) {
  const engine = new ScenarioEngine(casePack);
  let key = 0;
  const send = (command: ScenarioCommand, revision = engine.state.revision) =>
    engine.execute({
      revision,
      idempotencyKey: `00000000-0000-4000-8000-${String(++key).padStart(12, "0")}`,
      command,
    });
  return { engine, send };
}

const aspirinOrder = (dose = 300, unit: string | null = "mg") => ({
  drugId: "aspirin_300mg_tablet",
  dose,
  unit,
  route: "oral",
});

function prepareAspirin(run: ReturnType<typeof harness>, dose = 300, unit: string | null = "mg") {
  const result = run.send({ type: "prepare_medication", order: aspirinOrder(dose, unit) });
  return {
    result,
    id: run.engine.state.treatments.preparedOrders.at(-1)?.id,
  };
}

function giveAspirin(run: ReturnType<typeof harness>, dose = 300, unit: string | null = "mg") {
  const prepared = prepareAspirin(run, dose, unit);
  if (!prepared.id) return prepared.result;
  return run.send({ type: "administer_prepared", preparedOrderId: prepared.id });
}

const medicationChecks = {
  type: "confirm_medication_checks",
  allergyHistoryReviewed: true,
  administrationHistoryReviewed: true,
} as const;

function clinicalProjection(engine: ScenarioEngine) {
  const state = engine.snapshot();
  return {
    clock: state.clock,
    physiology: state.physiology,
    sensors: state.sensors,
    measurements: state.measurements,
    devices: state.devices,
    treatments: {
      ...state.treatments,
      receipts: state.treatments.receipts.map(({ id: _id, ...receipt }) => receipt),
      preparedOrders: state.treatments.preparedOrders.map(
        ({ id: _id, ...order }) => order,
      ),
      pendingEffects: state.treatments.pendingEffects.map(
        ({ id: _id, causedBy: _cause, ...effect }) => effect,
      ),
      appliedEffects: state.treatments.appliedEffects.map(
        ({ causedBy: _cause, ...effect }) => effect,
      ),
    },
    senior: state.senior,
    branch: state.branch,
    branchHistory: state.branchHistory,
  };
}

function eventProjection(engine: ScenarioEngine) {
  return engine.eventLog().map(
    ({ id: _id, runId: _run, wallTime: _wall, causedBy: _cause, ...event }) =>
      event,
  );
}

describe("deterministic scenario engine", () => {
  it("replays identical commands and times to identical clinical state and ordered events", () => {
    const commands: ScenarioCommand[] = [
      { type: "sensor", sensor: "ecg", connected: true },
      { type: "sensor", sensor: "spo2", connected: true },
      { type: "sensor", sensor: "cuff", connected: true },
      { type: "measure_bp" },
      medicationChecks,
      { type: "request_senior" },
      { type: "advance", seconds: 60 },
    ];
    const first = harness();
    const second = harness();
    for (const run of [first, second]) {
      for (const command of commands.slice(0, 5))
        expect(run.send(command).rejection).toBeNull();
      expect(giveAspirin(run).rejection).toBeNull();
      for (const command of commands.slice(5))
        expect(run.send(command).rejection).toBeNull();
    }
    expect(clinicalProjection(first.engine)).toEqual(
      clinicalProjection(second.engine),
    );
    expect(eventProjection(first.engine)).toEqual(eventProjection(second.engine));
  });

  it("executes timely, delayed, and inappropriate-attempt paths from fresh state", () => {
    const timely = harness();
    timely.send(medicationChecks);
    giveAspirin(timely);
    expect(timely.engine.state.branch).toMatchObject({
      kind: "timely_care",
      status: "active",
    });
    expect(timely.engine.state.physiology.heartRate).toBe(104);
    timely.send({ type: "request_senior" });
    timely.send({ type: "advance", seconds: 60 });
    expect(timely.engine.state.branch).toMatchObject({
      kind: "timely_care",
      status: "completed",
    });
    expect(timely.engine.state.treatments.appliedEffects).toHaveLength(1);
    const administered = timely.engine
      .eventLog()
      .find(({ type }) => type === "medication.administered")!;
    expect(
      timely.engine
        .eventLog()
        .find(({ type }) => type === "treatment.effect_applied")?.causedBy,
    ).toBe(administered.id);

    const delayed = harness();
    delayed.send({ type: "sensor", sensor: "ecg", connected: true });
    delayed.send({ type: "advance", seconds: 120 });
    expect(delayed.engine.state.branch.kind).toBe("delayed_care");
    expect(delayed.engine.state.physiology).toMatchObject({
      heartRate: 118,
      spo2: 93,
      painScore: 9,
    });
    expect(delayed.engine.state.measurements.hr).toBe(118);
    delayed.send(medicationChecks);
    giveAspirin(delayed);
    delayed.send({ type: "request_senior" });
    delayed.send({ type: "advance", seconds: 15 });
    expect(delayed.engine.state.branch.status).toBe("completed");

    const inappropriate = harness();
    inappropriate.send(medicationChecks);
    const blocked = giveAspirin(inappropriate, 600);
    expect(blocked.rejection?.status).toBe(422);
    expect(inappropriate.engine.state.branch.kind).toBe("inappropriate_attempt");
    expect(inappropriate.engine.state.treatments.receipts).toEqual([]);
    expect(
      inappropriate.engine.eventLog().map(({ type }) => type),
    ).toContain("medication.blocked");
    giveAspirin(inappropriate);
    expect(inappropriate.engine.state.branch.kind).toBe("timely_care");
    expect(inappropriate.engine.state.branchHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "inappropriate_attempt",
          outcome: "corrected administration accepted",
        }),
      ]),
    );
  });

  it("applies bounded branch timeouts without advancing beyond authored observations", () => {
    const timely = harness();
    timely.send(medicationChecks);
    giveAspirin(timely);
    timely.send({ type: "advance", seconds: 180 });
    expect(timely.engine.state.branch).toMatchObject({
      kind: "timely_care",
      status: "timed_out",
    });

    const delayed = harness();
    delayed.send({ type: "advance", seconds: 300 });
    expect(delayed.engine.state.branch).toMatchObject({
      kind: "delayed_care",
      status: "timed_out",
    });
    expect(delayed.engine.state.physiology.heartRate).toBe(118);

    const inappropriate = harness();
    inappropriate.send(medicationChecks);
    giveAspirin(inappropriate, 600);
    inappropriate.send({ type: "advance", seconds: 60 });
    expect(inappropriate.engine.state.branch).toMatchObject({
      kind: "arrival",
      status: "active",
    });
  });

  it("freezes the clock, effect timer, waveform source, and fluid delivery while paused", () => {
    const fluidCase = structuredClone(chestPainCaseV1);
    fluidCase.fluidRules[0]!.authorizationRule = "student_permitted";
    const run = harness(fluidCase);
    run.send({ type: "establish_iv" });
    run.send({
      type: "start_fluid",
      fluidId: "sodium_chloride_0_9",
      volume: 0.5,
      volumeUnit: "L",
      rate: 0.6,
      rateUnit: "L/h",
    });
    run.send(medicationChecks);
    giveAspirin(run);
    run.send({ type: "advance", seconds: 30 });
    expect(run.engine.state.devices.fluidPump.deliveredVolumeMl).toBeCloseTo(5);
    expect(run.engine.state.treatments.pendingEffects[0]?.dueAtMs).toBe(60000);
    run.send({ type: "pause" });
    const frozen = structuredClone(run.engine.snapshot());
    expect(run.send({ type: "advance", seconds: 30 }).rejection?.status).toBe(422);
    expect(run.engine.state.clock.simulationTimeMs).toBe(30000);
    expect(run.engine.state.devices.fluidPump.deliveredVolumeMl).toBe(
      frozen.devices.fluidPump.deliveredVolumeMl,
    );
    expect(run.engine.state.treatments.appliedEffects).toEqual([]);
    expect(run.engine.state.measurements).toEqual(frozen.measurements);
    run.send({ type: "resume" });
    run.send({ type: "advance", seconds: 30 });
    expect(run.engine.state.clock.simulationTimeMs).toBe(60000);
    expect(run.engine.state.devices.fluidPump.deliveredVolumeMl).toBeCloseTo(10);
    expect(run.engine.state.treatments.pendingEffects).toEqual([]);
    expect(run.engine.state.treatments.appliedEffects).toHaveLength(1);
  });

  it("normalizes units and enforces malformed, dose, repeat, and cumulative rules", () => {
    const converted = harness();
    converted.send(medicationChecks);
    expect(giveAspirin(converted, 0.3, "g").rejection).toBeNull();
    expect(converted.engine.state.treatments.receipts[0]).toMatchObject({
      dose: 0.3,
      unit: "g",
      normalizedQuantity: 300,
      normalizedUnit: "mg",
    });

    for (const [dose, unit] of [[0, "mg"], [-1, "mg"], [300, null]] as const) {
      const run = harness();
      run.send(medicationChecks);
      expect(prepareAspirin(run, dose, unit).result.rejection?.status).toBe(422);
      expect(run.engine.state.treatments.receipts).toEqual([]);
    }

    const repeatCase = structuredClone(chestPainCaseV1);
    repeatCase.medicationRules[0]!.repeatIntervalMs = 60000;
    repeatCase.medicationRules[0]!.cumulativeLimit = {
      quantity: 600,
      unit: "mg",
    };
    const repeat = harness(repeatCase);
    repeat.send(medicationChecks);
    giveAspirin(repeat);
    repeat.send({ type: "advance", seconds: 30 });
    expect(giveAspirin(repeat).rejection?.message).toContain("repeat interval");
    repeat.send({ type: "advance", seconds: 30 });
    expect(giveAspirin(repeat).rejection).toBeNull();
    repeat.send({ type: "advance", seconds: 60 });
    expect(giveAspirin(repeat).rejection?.message).toContain("Cumulative dose");
    expect(repeat.engine.state.treatments.receipts).toHaveLength(2);
  });

  it("deduplicates retries and double clicks into one administration", () => {
    const run = harness();
    run.send(medicationChecks);
    const prepared = prepareAspirin(run);
    expect(prepared.id).toBeTruthy();
    const envelope = {
      revision: run.engine.state.revision,
      idempotencyKey: randomUUID(),
      command: {
        type: "administer_prepared" as const,
        preparedOrderId: prepared.id!,
      },
    };
    const accepted = run.engine.execute(envelope);
    const retry = run.engine.execute(envelope);
    expect(accepted.rejection).toBeNull();
    expect(retry.duplicate).toBe(true);
    expect(run.engine.state.treatments.receipts).toHaveLength(1);
    expect(
      run.engine.eventLog().filter(({ type }) => type === "medication.administered"),
    ).toHaveLength(1);
  });

  it("rejects stale and unauthorized actions without treatment or device mutation", () => {
    const stale = harness();
    stale.send({ type: "sensor", sensor: "ecg", connected: true });
    const before = clinicalProjection(stale.engine);
    const rejected = stale.send({ type: "sensor", sensor: "spo2", connected: true }, 0);
    expect(rejected.rejection?.status).toBe(409);
    expect(clinicalProjection(stale.engine)).toEqual(before);
    expect(stale.engine.eventLog().at(-1)).toMatchObject({
      type: "command.rejected",
      stateVersion: 1,
    });

    const protectedCase = structuredClone(chestPainCaseV1);
    protectedCase.medicationRules[0]!.authorizationRule = "senior_required";
    const unauthorized = harness(protectedCase);
    unauthorized.send(medicationChecks);
    const devicesBefore = structuredClone(unauthorized.engine.state.devices);
    expect(giveAspirin(unauthorized).rejection?.message).toContain(
      "Senior authorization",
    );
    expect(unauthorized.engine.state.devices).toEqual(devicesBefore);
    expect(unauthorized.engine.state.treatments.receipts).toEqual([]);
    expect(unauthorized.engine.state.treatments.preparedOrders.at(-1)).toMatchObject({
      status: "blocked",
      message: expect.stringContaining("Senior authorization"),
    });
    unauthorized.send({ type: "request_senior" });
    unauthorized.send({
      type: "request_authorization",
      actionKind: "medication",
      itemId: "aspirin_300mg_tablet",
    });
    unauthorized.send({ type: "advance", seconds: 15 });
    expect(giveAspirin(unauthorized).rejection).toBeNull();
    expect(
      unauthorized.engine
        .eventLog()
        .filter(({ type }) => type === "medication.authorized"),
    ).toHaveLength(1);

    const accessCase = structuredClone(chestPainCaseV1);
    accessCase.medicationRules[0]!.requiredAccess = ["iv"];
    const access = harness(accessCase);
    access.send(medicationChecks);
    expect(giveAspirin(access).rejection?.message).toContain("IV access");
    expect(access.engine.state.treatments.receipts).toEqual([]);
    access.send({ type: "establish_iv" });
    expect(giveAspirin(access).rejection).toBeNull();
  });

  it("derives monitor snapshots from physiology and never refreshes intermittent BP", () => {
    const run = harness();
    expect(run.engine.state.measurements).toMatchObject({
      hr: null,
      spo2: null,
      bp: null,
    });
    run.send({ type: "sensor", sensor: "ecg", connected: true });
    run.send({ type: "sensor", sensor: "spo2", connected: true });
    run.send({ type: "sensor", sensor: "cuff", connected: true });
    run.send({ type: "measure_bp" });
    expect(run.engine.state.measurements.bp?.value).toBe("146/88");
    run.send({ type: "advance", seconds: 120 });
    expect(run.engine.state.measurements).toMatchObject({
      hr: 118,
      spo2: 93,
      bp: { value: "146/88", measuredAtMs: 0 },
    });
    run.send({ type: "sensor", sensor: "ecg", connected: false });
    run.send({ type: "sensor", sensor: "spo2", connected: false });
    expect(run.engine.state.measurements).toMatchObject({ hr: null, spo2: null });
  });

  it("keeps source, revision, and explicit review result on every enabled rule", () => {
    const reviews = [
      chestPainCaseV1.scenarioRules.clinicalReview,
      ...chestPainCaseV1.medicationRules.map(({ clinicalReview }) => clinicalReview),
      ...chestPainCaseV1.fluidRules.map(({ clinicalReview }) => clinicalReview),
    ];
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) {
      expect(review.sourceTitle).not.toBe("");
      expect(review.sourceUrl ?? review.sourcePath).toBeTruthy();
      expect(review.sourceRevision).not.toBe("");
      expect(review.sourceApplicability).toBeTruthy();
      expect(review.reviewStatus).toBe("draft_unreviewed");
    }
  });

  it("keeps lifecycle separate and continues clinical time during handoff", () => {
    const run = harness();
    run.send({ type: "set_lifecycle", lifecycle: "handoff" });
    expect(run.engine.state.lifecycle).toBe("handoff");
    run.send({ type: "advance", seconds: 10 });
    expect(run.engine.state.clock.simulationTimeMs).toBe(10000);
    run.send({ type: "set_lifecycle", lifecycle: "debrief" });
    run.send({ type: "set_lifecycle", lifecycle: "ended" });
    expect(run.engine.state).toMatchObject({
      lifecycle: "ended",
      clock: { running: false },
    });
  });

  it("releases assessment findings on demand and permits repeated reassessment", () => {
    const run = harness();
    expect(run.engine.state.assessments).toEqual([]);
    expect(
      run.send({ type: "perform_assessment", findingId: "symptom_onset" }).rejection,
    ).toBeNull();
    run.send({ type: "perform_assessment", findingId: "pain_score" });
    run.send({ type: "advance", seconds: 120 });
    run.send({ type: "perform_assessment", findingId: "pain_score" });
    expect(run.engine.state.assessments.find(({ id }) => id === "pain_score")).toMatchObject({
      value: 9,
      count: 2,
      firstPerformedAtMs: 0,
      lastPerformedAtMs: 120000,
    });
    expect(
      run.engine.eventLog().filter(({ type }) => type === "assessment.performed"),
    ).toHaveLength(3);
  });

  it("keeps requested, collected, available, displayed, and interpreted investigations distinct", () => {
    const run = harness();
    run.send({ type: "request_investigation", investigationId: "twelve_lead_ecg" });
    run.send({ type: "collect_investigation", investigationId: "twelve_lead_ecg" });
    const premature = run.send({
      type: "display_investigation",
      investigationId: "twelve_lead_ecg",
      view: "artwork",
    });
    expect(premature.rejection?.message).toContain("not yet available");
    expect(run.engine.state.investigations[0]).toMatchObject({
      status: "pending",
      result: null,
      report: null,
    });
    run.send({ type: "advance", seconds: 15 });
    expect(run.engine.state.investigations[0]?.status).toBe("available");
    run.send({
      type: "display_investigation",
      investigationId: "twelve_lead_ecg",
      view: "artwork",
    });
    run.send({
      type: "display_investigation",
      investigationId: "twelve_lead_ecg",
      view: "report",
    });
    run.send({
      type: "interpret_investigation",
      investigationId: "twelve_lead_ecg",
      interpretation: "Sinus tachycardia; I would seek senior ECG review.",
    });
    expect(run.engine.state.investigations[0]).toMatchObject({
      status: "displayed",
      displayedViews: ["artwork", "report"],
      interpretations: [{ content: expect.stringContaining("Sinus tachycardia") }],
    });
    expect(
      run.engine.eventLog().map(({ type }) => type),
    ).toEqual(expect.arrayContaining([
      "investigation.requested",
      "investigation.collected",
      "investigation.available",
      "investigation.displayed",
      "investigation.interpreted",
    ]));
  });

  it("applies, adjusts, and stops oxygen and authorizes fluid with cumulative delivery", () => {
    const run = harness();
    run.send({ type: "set_oxygen", deviceId: "nasal_cannula", setting: 2, unit: "L/min" });
    run.send({ type: "set_oxygen", deviceId: "nasal_cannula", setting: 4, unit: "L/min" });
    run.send({ type: "stop_oxygen" });
    expect(run.engine.state.devices.oxygen.status).toBe("off");
    run.send({ type: "establish_iv" });
    run.send({ type: "inspect_iv_patency" });
    run.send({ type: "request_senior" });
    run.send({
      type: "request_authorization",
      actionKind: "fluid",
      itemId: "sodium_chloride_0_9",
    });
    expect(run.engine.state.authorizations[0]?.status).toBe("requested");
    run.send({ type: "advance", seconds: 15 });
    expect(run.engine.state.authorizations[0]?.status).toBe("authorized");
    run.send({
      type: "start_fluid",
      fluidId: "sodium_chloride_0_9",
      volume: 100,
      volumeUnit: "mL",
      rate: 600,
      rateUnit: "mL/h",
    });
    run.send({ type: "advance", seconds: 30 });
    run.send({ type: "stop_fluid" });
    expect(run.engine.state.devices).toMatchObject({
      ivAccess: { patency: "patent" },
      fluidPump: { status: "stopped", deliveredVolumeMl: 5 },
    });
  });

  it("preserves note revisions, authorization, handoff, unsupported requests, and Finish evidence", () => {
    const run = harness();
    run.send({ type: "save_note", content: "Initial assessment and plan." });
    run.send({ type: "save_note", content: "Revised assessment, rationale and plan." });
    run.send({ type: "request_case_item", kind: "investigation", name: "CT coronary angiogram" });
    expect(run.send({ type: "finish" }).rejection?.message).toContain("handoff");
    run.send({ type: "record_handoff", content: "SBAR: chest pain assessed; senior review requested." });
    expect(run.send({ type: "finish" }).rejection).toBeNull();
    expect(run.engine.state).toMatchObject({
      lifecycle: "ended",
      clock: { running: false },
      notes: [
        { revision: 1, content: "Initial assessment and plan." },
        { revision: 2, content: "Revised assessment, rationale and plan." },
      ],
      handoffs: [{ content: expect.stringContaining("SBAR") }],
      finishedAtMs: 0,
    });
    expect(run.engine.eventLog().map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "note.saved",
        "case.item_unavailable",
        "handoff.recorded",
        "session.ended",
      ]),
    );
  });
});
