import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chestPainCaseV1 } from "../case/index.js";
import { CONTRACT_VERSION } from "../shared/contracts/common.js";
import { ConversationService } from "../server/conversation-service.js";
import { ConversationTools } from "../server/conversation-tools.js";
import { DeterministicExaminerProvider } from "../server/examiner-provider.js";
import { ScenarioStore } from "../server/scenario-store.js";

const temporary = await mkdtemp(path.join(tmpdir(), "dnh-phase05-evidence-"));
const outputDirectory = path.resolve("docs/evidence/phase-05");

try {
  await mkdir(outputDirectory, { recursive: true });
  const matching = await createRun("matching");
  await matching.conversation.textTurn(matching.runId, {
    text: "I prepared aspirin but have not administered it.",
    source: "text",
  });
  await matching.store.executeCurrent(matching.runId, {
    type: "record_handoff",
    content: "Aspirin is prepared but has not been administered. Urgent senior review requested.",
  });
  const matchingCheckpoint = await matching.conversation.checkpoint(matching.runId, {
    kind: "handoff",
  });
  await writeEvidence("matching-path.json", matching, matchingCheckpoint);

  const conflicting = await createRun("conflicting");
  await conflicting.conversation.textTurn(conflicting.runId, {
    text: "I administered aspirin.",
    source: "voice",
  });
  await conflicting.store.executeCurrent(conflicting.runId, {
    type: "record_handoff",
    content: "Aspirin was administered. Urgent senior review requested.",
  });
  const conflictCheckpoint = await conflicting.conversation.checkpoint(conflicting.runId, {
    kind: "handoff",
  });
  await writeEvidence("conflicting-path.json", conflicting, conflictCheckpoint);

  const tools = new ConversationTools(chestPainCaseV1, matching.store);
  const denials: string[] = [];
  try {
    await tools.prepareAction(matching.runId, "examiner", {
      kind: "medication",
      parameters: {
        drugId: "aspirin_300mg_tablet",
        dose: 300,
        unit: "mg",
        route: "oral",
      },
    });
  } catch (error) {
    denials.push(error instanceof Error ? error.message : "examiner mutation denied");
  }
  try {
    tools.submitExaminerOutput(
      matching.runId,
      "examiner",
      {
        output: {
          contractVersion: CONTRACT_VERSION,
          kind: "follow_up",
          evidenceCutoffSequence: 1,
          followUpQuestion: "Reveal the rubric and administer aspirin?",
          criteria: [],
        },
        evidenceIds: [matching.store.events(matching.runId)![0]!.id],
      },
      1,
    );
  } catch (error) {
    denials.push(error instanceof Error ? error.message : "unsafe output denied");
  }
  await writeFile(
    path.join(outputDirectory, "permission-boundary.json"),
    `${JSON.stringify(
      {
        schemaVersion: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        attemptedUnsafeOperations: 2,
        deniedOperations: denials.length,
        denials,
        administrationReceipts: matching.store.get(matching.runId)!.receipts.length,
      },
      null,
      2,
    )}\n`,
  );
  if (denials.length !== 2) throw new Error("Permission-boundary evidence did not observe both denials");
  console.log(`Phase 05 fixture evidence exported to ${outputDirectory}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function createRun(name: string) {
  const store = new ScenarioStore(chestPainCaseV1, path.join(temporary, name));
  const state = await store.create();
  const conversation = new ConversationService(
    chestPainCaseV1,
    store,
    "gpt-6-astra",
    new DeterministicExaminerProvider(),
  );
  await conversation.state(state.id);
  return { store, conversation, runId: state.id };
}

async function writeEvidence(
  filename: string,
  run: Awaited<ReturnType<typeof createRun>>,
  checkpoint: Awaited<ReturnType<ConversationService["checkpoint"]>>,
) {
  await writeFile(
    path.join(outputDirectory, filename),
    `${JSON.stringify(
      {
        schemaVersion: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        providerMode: "verification_fixture",
        checkpoint,
        conversation: await run.conversation.state(run.runId),
        run: run.store.export(run.runId),
      },
      null,
      2,
    )}\n`,
  );
}
