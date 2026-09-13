import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { chestPainCaseV1 } from "../case/index.js";
import { loadConfig, requireOpenAIKey } from "../server/config.js";
import { ConversationService } from "../server/conversation-service.js";
import { DebriefService } from "../server/debrief-service.js";
import { OpenAIExaminerProvider } from "../server/examiner-provider.js";
import { ScenarioStore } from "../server/scenario-store.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const temporary = await mkdtemp(path.join(tmpdir(), "dnh-phase06-real-"));
const startedAt = new Date().toISOString();

try {
  const store = new ScenarioStore(chestPainCaseV1, temporary);
  const state = await store.create();
  const provider = new OpenAIExaminerProvider(new OpenAI({ apiKey: requireOpenAIKey(config), maxRetries: 0 }));
  const conversation = new ConversationService(chestPainCaseV1, store, config.examinerModel, provider);
  await conversation.state(state.id);
  await store.executeCurrent(state.id, { type: "perform_assessment", findingId: "pain_score" });
  await store.executeCurrent(state.id, { type: "request_senior" });
  await store.executeCurrent(state.id, { type: "record_handoff", content: "Chest pain and pain score assessed. No medication administered. Urgent senior review requested." });
  const debrief = new DebriefService(chestPainCaseV1, store, conversation);
  const result = await debrief.finish(state.id, { noteContent: "Chest pain assessed; no medication administered; senior review requested." });
  if (result.status !== "ready" || result.feedbackRevisions[0]?.output.criteria.length !== 6)
    throw new Error(`Real debrief failed: ${result.status} — ${result.evaluationMessage}`);
  const feedback = result.feedbackRevisions[0]!;
  const knownIds = new Set(result.evidence.map(({ id }) => id));
  const cited = feedback.output.criteria.flatMap(({ evidenceIds }) => evidenceIds)
    .concat(feedback.output.strengthEvidenceIds ?? [], feedback.output.priorityImprovementEvidenceIds ?? []);
  if (!cited.every((id) => knownIds.has(id))) throw new Error("Real feedback contained an unresolved citation");
  const receipt = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    startedAt,
    provider: "OpenAI Agents API",
    mode: "real",
    mocked: false,
    model: config.examinerModel,
    status: result.status,
    cutoffName: result.cutoffName,
    evidenceCutoffSequence: result.evidenceCutoffSequence,
    criteria: feedback.output.criteria.map(({ criterion, rating, evidenceIds }) => ({ criterion, rating, citationCount: evidenceIds.length })),
    allCitationsResolved: true,
  };
  const directory = path.resolve("docs/evidence/phase-06");
  await mkdir(directory, { recursive: true });
  const receiptPath = path.join(directory, "real-debrief-checkpoint.json");
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Real Phase 06 debrief passed; sanitized receipt: ${receiptPath}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
