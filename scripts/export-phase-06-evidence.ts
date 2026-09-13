import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chestPainCaseV1 } from "../case/index.js";
import { CONTRACT_VERSION } from "../shared/contracts/common.js";
import { ConversationService } from "../server/conversation-service.js";
import { ConversationTools } from "../server/conversation-tools.js";
import { DebriefService } from "../server/debrief-service.js";
import { DeterministicExaminerProvider, type ExaminerProvider, type ExaminerTurnInput } from "../server/examiner-provider.js";
import { ScenarioStore } from "../server/scenario-store.js";

const temporary = await mkdtemp(path.join(tmpdir(), "dnh-phase06-evidence-"));
const outputDirectory = path.resolve("docs/evidence/phase-06");

class AlwaysFailProvider implements ExaminerProvider {
  readonly mode = "verification_fixture" as const;
  async runTurn(_input: ExaminerTurnInput): Promise<never> { throw new Error("deliberate evaluator failure"); }
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await exportPath("timely-care", async ({ store, runId }) => {
    for (const findingId of ["symptom_onset", "pain_score", "airway_assessment", "breathing_assessment"])
      await store.executeCurrent(runId, { type: "perform_assessment", findingId });
    await store.executeCurrent(runId, { type: "request_investigation", investigationId: "twelve_lead_ecg" });
    await store.executeCurrent(runId, { type: "collect_investigation", investigationId: "twelve_lead_ecg" });
    await store.executeCurrent(runId, { type: "advance", seconds: 30 });
    await store.executeCurrent(runId, { type: "display_investigation", investigationId: "twelve_lead_ecg", view: "report" });
    await store.executeCurrent(runId, { type: "interpret_investigation", investigationId: "twelve_lead_ecg", interpretation: "Sinus tachycardia; urgent senior ECG review required." });
    await administerValid(store, runId);
    await store.executeCurrent(runId, { type: "advance", seconds: 60 });
    await store.executeCurrent(runId, { type: "perform_assessment", findingId: "pain_score" });
    await store.executeCurrent(runId, { type: "request_senior" });
    await store.executeCurrent(runId, { type: "advance", seconds: 15 });
  });
  await exportPath("delayed-care", async ({ store, runId }) => {
    await store.executeCurrent(runId, { type: "advance", seconds: 120 });
    await store.executeCurrent(runId, { type: "perform_assessment", findingId: "pain_score" });
    await store.executeCurrent(runId, { type: "request_senior" });
  });
  await exportPath("inappropriate-attempt", async ({ store, runId }) => {
    await store.executeCurrent(runId, { type: "prepare_medication", order: { drugId: "aspirin_300mg_tablet", dose: 600, unit: "mg", route: "oral" } });
    const id = store.get(runId)!.treatments.preparedOrders[0]!.id;
    await store.executeCurrent(runId, { type: "administer_prepared", preparedOrderId: id });
    await administerValid(store, runId);
  });

  const validation = await createRun();
  const tools = new ConversationTools(chestPainCaseV1, validation.store);
  let invalidReferenceError = "";
  try {
    tools.submitExaminerOutput(validation.runId, "examiner", {
      output: feedbackFixture(1, "invented-evidence"),
      evidenceIds: ["invented-evidence"],
    }, 1);
  } catch (error) {
    invalidReferenceError = error instanceof Error ? error.message : "validation failed";
  }
  const failing = await createRun(new AlwaysFailProvider());
  await failing.store.executeCurrent(failing.runId, { type: "record_handoff", content: "Incomplete case; senior review requested." });
  const unavailable = await failing.debrief.finish(failing.runId, {});
  await writeFile(path.join(outputDirectory, "cutoff-failure-validation.json"), `${JSON.stringify({
    schemaVersion: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    invalidReferencePreventedPublication: /outside the validated cutoff/.test(invalidReferenceError),
    invalidReferenceError,
    evaluatorFailureStatus: unavailable.status,
    retainedEvidenceCount: unavailable.evidence.length,
    retainedCutoff: { name: unavailable.cutoffName, sequence: unavailable.evidenceCutoffSequence },
  }, null, 2)}\n`);
  console.log(`Phase 06 evidence exported to ${outputDirectory}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function exportPath(name: string, actions: (run: Awaited<ReturnType<typeof createRun>>) => Promise<void>) {
  const run = await createRun();
  await actions(run);
  await run.store.executeCurrent(run.runId, { type: "save_note", content: `${name}: assessment, actions, rationale, and senior plan documented.` });
  await run.store.executeCurrent(run.runId, { type: "record_handoff", content: `${name}: findings and actual treatment status handed to senior review.` });
  const debrief = await run.debrief.finish(run.runId, {});
  const known = new Set(debrief.evidence.map(({ id }) => id));
  const feedback = debrief.feedbackRevisions[0]!.output;
  const citations = feedback.criteria.flatMap(({ evidenceIds }) => evidenceIds)
    .concat(feedback.strengthEvidenceIds ?? [], feedback.priorityImprovementEvidenceIds ?? []);
  if (!citations.every((id) => known.has(id))) throw new Error(`${name} contains an unresolved feedback citation`);
  await writeFile(path.join(outputDirectory, `${name}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), debrief, run: run.store.export(run.runId) }, null, 2)}\n`);
}

async function createRun(provider: ExaminerProvider = new DeterministicExaminerProvider()) {
  const store = new ScenarioStore(chestPainCaseV1, path.join(temporary, crypto.randomUUID()));
  const state = await store.create();
  const conversation = new ConversationService(chestPainCaseV1, store, "gpt-6-astra", provider);
  await conversation.state(state.id);
  return { store, conversation, debrief: new DebriefService(chestPainCaseV1, store, conversation), runId: state.id };
}

async function administerValid(store: ScenarioStore, runId: string) {
  await store.executeCurrent(runId, { type: "confirm_medication_checks", allergyHistoryReviewed: true, administrationHistoryReviewed: true });
  await store.executeCurrent(runId, { type: "prepare_medication", order: { drugId: "aspirin_300mg_tablet", dose: 300, unit: "mg", route: "oral" } });
  const id = store.get(runId)!.treatments.preparedOrders.find(({ status }) => status === "prepared")!.id;
  await store.executeCurrent(runId, { type: "administer_prepared", preparedOrderId: id });
}

function feedbackFixture(cutoff: number, evidenceId: string) {
  return {
    contractVersion: CONTRACT_VERSION,
    kind: "feedback" as const,
    evidenceCutoffSequence: cutoff,
    criteria: chestPainCaseV1.hiddenRubric.criteria.map(({ id: criterion }) => ({ criterion, rating: "insufficient_evidence" as const, reason: "No evidence.", evidenceIds: criterion === "assessment" ? [evidenceId] : [] })),
    strength: "Run started.", strengthEvidenceIds: [evidenceId],
    priorityImprovement: "Gather evidence.", priorityImprovementEvidenceIds: [evidenceId],
    nextPracticeObjective: "Document assessment evidence.",
  };
}
