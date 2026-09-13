import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { chestPainCaseV1 } from "../case/index.js";
import { loadConfig, requireOpenAIKey } from "../server/config.js";
import { ConversationService } from "../server/conversation-service.js";
import { OpenAIExaminerProvider } from "../server/examiner-provider.js";
import { ScenarioStore } from "../server/scenario-store.js";

function opaque(value: string | null) {
  if (!value) return null;
  return value.length < 13 ? "<redacted>" : `${value.slice(0, 5)}…${value.slice(-5)}`;
}

const config = loadConfig();
const temporary = await mkdtemp(path.join(tmpdir(), "dnh-phase05-"));
const startedAt = new Date().toISOString();

try {
  const store = new ScenarioStore(chestPainCaseV1, temporary);
  const state = await store.create();
  const provider = new OpenAIExaminerProvider(
    new OpenAI({ apiKey: requireOpenAIKey(config), maxRetries: 0 }),
  );
  const conversation = new ConversationService(
    chestPainCaseV1,
    store,
    config.examinerModel,
    provider,
  );
  await conversation.textTurn(state.id, {
    text: "I prepared aspirin but have not administered it.",
    source: "text",
  });
  const assessment = await conversation.checkpoint(state.id, { kind: "assessment" });
  if (assessment.status !== "completed" || assessment.output !== null || !assessment.sessionId) {
    throw new Error(`Real assessment checkpoint failed: ${assessment.status} — ${assessment.message}`);
  }
  await store.executeCurrent(state.id, {
    type: "record_handoff",
    content: "Morgan Lee has central chest pressure. Aspirin is prepared but has not been administered. I request urgent senior review.",
  });
  const checkpoint = await conversation.checkpoint(state.id, { kind: "handoff" });
  if (checkpoint.status !== "completed" || !checkpoint.output?.followUpQuestion) {
    throw new Error(`Real checkpoint failed: ${checkpoint.status} — ${checkpoint.message}`);
  }
  if (checkpoint.sessionId !== assessment.sessionId) {
    throw new Error("The handoff checkpoint did not continue the assessment session.");
  }
  const repeated = await conversation.checkpoint(state.id, { kind: "reasoning" });
  if (repeated.status !== "skipped") {
    throw new Error("The managed examiner delivered more than one follow-up.");
  }
  const events = store.events(state.id)!;
  const receipt = {
    schemaVersion: "1.0.0",
    provider: "OpenAI Agents API",
    mode: "real",
    mocked: false,
    model: config.examinerModel,
    sessionId: opaque(checkpoint.sessionId),
    startedAt,
    completedAt: new Date().toISOString(),
    checkpointStatus: checkpoint.status,
    activeCareCheckpointStatus: assessment.status,
    sameSessionAcrossCheckpoints: checkpoint.sessionId === assessment.sessionId,
    continuedSessionCheck: repeated.status,
    followUpQuestion: checkpoint.output.followUpQuestion,
    evidenceCutoffSequence: checkpoint.output.evidenceCutoffSequence,
    eventTypes: events.map(({ type }) => type),
    examinerOutputEvents: events.filter(({ type }) => type === "examiner.output_submitted").length,
    administrationReceipts: store.get(state.id)!.receipts.length,
  };
  const evidenceDirectory = path.join(process.cwd(), "docs", "evidence", "phase-05");
  await mkdir(evidenceDirectory, { recursive: true });
  const receiptPath = path.join(evidenceDirectory, "real-examiner-checkpoint.json");
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Real Phase 05 examiner checkpoint passed; sanitized receipt: ${receiptPath}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
