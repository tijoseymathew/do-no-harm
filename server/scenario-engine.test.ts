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

const aspirin = (dose = 300, unit: string | null = "mg") =>
  ({
    type: "administer",
    order: {
      drugId: "aspirin_300mg_tablet",
      dose,
      unit,
      route: "oral",
    },
  }) as const;

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
      aspirin(),
      { type: "request_senior" },
      { type: "advance", seconds: 60 },
    ];
    const first = harness();
    const second = harness();
    for (const command of commands) {
      expect(first.send(command).rejection).toBeNull();
      expect(second.send(command).rejection).toBeNull();
    }
    expect(clinicalProjection(first.engine)).toEqual(
      clinicalProjection(second.engine),
    );
    expect(eventProjection(first.engine)).toEqual(eventProjection(second.engine));
  });

  it("executes timely, delayed, and inappropriate-attempt paths from fresh state", () => {
    const timely = harness();
    timely.send(medicationChecks);
    timely.send(aspirin());
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
    delayed.send(aspirin());
    delayed.send({ type: "request_senior" });
    delayed.send({ type: "advance", seconds: 15 });
    expect(delayed.engine.state.branch.status).toBe("completed");

    const inappropriate = harness();
    inappropriate.send(medicationChecks);
    const blocked = inappropriate.send(aspirin(600));
    expect(blocked.rejection?.status).toBe(422);
    expect(inappropriate.engine.state.branch.kind).toBe("inappropriate_attempt");
    expect(inappropriate.engine.state.treatments.receipts).toEqual([]);
    expect(
      inappropriate.engine.eventLog().map(({ type }) => type),
    ).toContain("medication.blocked");
    inappropriate.send(aspirin());
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
    timely.send(aspirin());
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
    inappropriate.send(aspirin(600));
    inappropriate.send({ type: "advance", seconds: 60 });
    expect(inappropriate.engine.state.branch).toMatchObject({
      kind: "arrival",
      status: "active",
    });
  });

  it("freezes the clock, effect timer, waveform source, and fluid delivery while paused", () => {
    const run = harness();
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
    run.send(aspirin());
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
    expect(converted.send(aspirin(0.3, "g")).rejection).toBeNull();
    expect(converted.engine.state.treatments.receipts[0]).toMatchObject({
      dose: 0.3,
      unit: "g",
      normalizedQuantity: 300,
      normalizedUnit: "mg",
    });

    for (const command of [aspirin(0), aspirin(-1), aspirin(300, null)]) {
      const run = harness();
      run.send(medicationChecks);
      expect(run.send(command).rejection?.status).toBe(422);
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
    repeat.send(aspirin());
    repeat.send({ type: "advance", seconds: 30 });
    expect(repeat.send(aspirin()).rejection?.message).toContain("repeat interval");
    repeat.send({ type: "advance", seconds: 30 });
    expect(repeat.send(aspirin()).rejection).toBeNull();
    repeat.send({ type: "advance", seconds: 60 });
    expect(repeat.send(aspirin()).rejection?.message).toContain("Cumulative dose");
    expect(repeat.engine.state.treatments.receipts).toHaveLength(2);
  });

  it("deduplicates retries and double clicks into one administration", () => {
    const run = harness();
    run.send(medicationChecks);
    const envelope = {
      revision: run.engine.state.revision,
      idempotencyKey: randomUUID(),
      command: aspirin(),
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
    const treatmentBefore = structuredClone(unauthorized.engine.state.treatments);
    const devicesBefore = structuredClone(unauthorized.engine.state.devices);
    expect(unauthorized.send(aspirin()).rejection?.message).toContain(
      "Senior authorization",
    );
    expect(unauthorized.engine.state.treatments).toEqual(treatmentBefore);
    expect(unauthorized.engine.state.devices).toEqual(devicesBefore);
    expect(unauthorized.engine.state.treatments.receipts).toEqual([]);
    unauthorized.send({ type: "request_senior" });
    unauthorized.send({ type: "advance", seconds: 15 });
    expect(unauthorized.send(aspirin()).rejection).toBeNull();
    expect(
      unauthorized.engine
        .eventLog()
        .filter(({ type }) => type === "medication.authorized"),
    ).toHaveLength(1);

    const accessCase = structuredClone(chestPainCaseV1);
    accessCase.medicationRules[0]!.requiredAccess = ["iv"];
    const access = harness(accessCase);
    access.send(medicationChecks);
    expect(access.send(aspirin()).rejection?.message).toContain("IV access");
    expect(access.engine.state.treatments.receipts).toEqual([]);
    access.send({ type: "establish_iv" });
    expect(access.send(aspirin()).rejection).toBeNull();
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
});
