import { describe, expect, it } from "vitest";
import { chestPainCaseV1 } from "../../case/chest-pain.v1.js";
import { CONTRACT_VERSION, ObservationSchema, RunEventSchema } from "./common.js";
import { CasePackSchema, toStudentCase } from "./server.js";
import { StudentCaseSchema } from "./student.js";

describe("versioned case contracts", () => {
  it("validates the complete chest-pain case fixture", () => {
    expect(CasePackSchema.parse(chestPainCaseV1)).toEqual(chestPainCaseV1);
    expect(StudentCaseSchema.safeParse(toStudentCase(chestPainCaseV1)).success).toBe(true);
  });

  it("rejects a numeric observation without a unit", () => {
    const result = ObservationSchema.safeParse({
      ...chestPainCaseV1.observations.find(({ id }) => id === "heart_rate"),
      unit: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid event type", () => {
    const result = RunEventSchema.safeParse({
      contractVersion: CONTRACT_VERSION,
      id: "event_1",
      runId: "run_1",
      sequence: 1,
      wallTime: "2026-09-13T00:00:00.000Z",
      simulationTime: 0,
      actor: "student",
      type: "medication.imagined",
      payload: {},
      stateVersion: 0,
      caseVersion: chestPainCaseV1.caseVersion,
    });
    expect(result.success).toBe(false);
  });

  it("rejects absent required case fields", () => {
    const { patient: _patient, ...withoutPatient } = chestPainCaseV1;
    expect(CasePackSchema.safeParse(withoutPatient).success).toBe(false);
  });

  it("does not expose hidden medication rules or rubric in the student contract", () => {
    const visible = toStudentCase(chestPainCaseV1);
    const serialized = JSON.stringify(visible);
    expect(serialized).not.toContain("hiddenRubric");
    expect(serialized).not.toContain("referenceDoseRule");
    expect(serialized).not.toContain("expectedEvidence");
  });
});
