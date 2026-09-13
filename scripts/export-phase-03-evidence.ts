import { mkdir, writeFile } from "node:fs/promises";
import { chestPainCaseV1 } from "../case/chest-pain.v1.js";
import { ScenarioEngine } from "../server/scenario-engine.js";
import type { ScenarioCommand } from "../shared/contracts/scenario.js";

const outputDirectory = "docs/evidence/phase-03";

function runPath(name: string, commands: ScenarioCommand[]) {
  let id = 0;
  const engine = new ScenarioEngine(chestPainCaseV1, {
    runId: `run_${name}`,
    createId: () => `${name}_${String(++id).padStart(4, "0")}`,
    now: () => new Date("2026-09-13T00:00:00.000Z"),
  });
  commands.forEach((command, index) => {
    engine.execute({
      revision: engine.state.revision,
      idempotencyKey: `${name}_command_${index + 1}`,
      command,
    });
  });
  const state = engine.snapshot();
  return {
    state: {
      revision: state.revision,
      simulationTimeMs: state.clock.simulationTimeMs,
      physiology: state.physiology,
      measurements: state.measurements,
      devices: state.devices,
      treatments: state.treatments,
      senior: state.senior,
      branch: state.branch,
      branchHistory: state.branchHistory,
    },
    events: engine.eventLog(),
  };
}

const checks: ScenarioCommand = {
  type: "confirm_medication_checks",
  allergyHistoryReviewed: true,
  administrationHistoryReviewed: true,
};
const aspirin = (dose: number): ScenarioCommand => ({
  type: "administer",
  order: {
    drugId: "aspirin_300mg_tablet",
    dose,
    unit: "mg",
    route: "oral",
  },
});

const branchEvidence = {
  generatedBy: "npm run evidence:phase03",
  caseVersion: chestPainCaseV1.caseVersion,
  deterministicWallTime: "2026-09-13T00:00:00.000Z",
  paths: {
    timelyCare: runPath("timely", [
      checks,
      aspirin(300),
      { type: "request_senior" },
      { type: "advance", seconds: 60 },
    ]),
    delayedCare: runPath("delayed", [
      { type: "sensor", sensor: "ecg", connected: true },
      { type: "advance", seconds: 120 },
      checks,
      aspirin(300),
      { type: "request_senior" },
      { type: "advance", seconds: 15 },
    ]),
    inappropriateAttempt: runPath("inappropriate", [
      checks,
      aspirin(600),
      aspirin(300),
    ]),
  },
};

const reviewEvidence = {
  generatedBy: "npm run evidence:phase03",
  caseVersion: chestPainCaseV1.caseVersion,
  clinicalAcceptance: "blocked_pending_qualified_review",
  rules: [
    {
      kind: "scenario_progression",
      id: "adult_chest_pain_progression",
      enabledScope: "development_fixture_only",
      ...chestPainCaseV1.scenarioRules.clinicalReview,
    },
    ...chestPainCaseV1.medicationRules.map((rule) => ({
      kind: "medication",
      id: rule.id,
      enabledScope: "development_fixture_only",
      ...rule.clinicalReview,
    })),
    ...chestPainCaseV1.fluidRules.map((rule) => ({
      kind: "fluid",
      id: rule.id,
      enabledScope: "development_fixture_only",
      ...rule.clinicalReview,
    })),
  ],
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    `${outputDirectory}/branch-replay.json`,
    `${JSON.stringify(branchEvidence, null, 2)}\n`,
  ),
  writeFile(
    `${outputDirectory}/clinical-rule-review.json`,
    `${JSON.stringify(reviewEvidence, null, 2)}\n`,
  ),
]);

console.log(
  `Wrote deterministic branch replay and clinical review status to ${outputDirectory}.`,
);
