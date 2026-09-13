import { expect, it } from "vitest";
import { chestPainCaseV1 } from "../case/index.js";
import { liveInstructions } from "./live-instructions.js";

it("grounds voice in authored history without exposing withheld, future, or examination facts", () => {
  const modified = structuredClone(chestPainCaseV1);
  const history = modified.observations.find((fact) => fact.observableBy === "history")!;
  modified.observations.push(
    { ...history, id: "private_fact", value: "PRIVATE_SENTINEL", studentVisible: false },
    { ...history, id: "future_fact", value: "FUTURE_SENTINEL", availableAtSimulationMs: 99999 },
    { ...history, id: "exam_fact", value: "EXAM_SENTINEL", observableBy: "assessment" },
  );
  const instructions = liveInstructions(modified);
  expect(instructions).toContain("45 minutes before arrival");
  expect(instructions).toContain("delegate immediately and wait");
  for (const sentinel of ["PRIVATE_SENTINEL", "FUTURE_SENTINEL", "EXAM_SENTINEL"])
    expect(instructions).not.toContain(sentinel);
});
