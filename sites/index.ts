import { liveInstructions } from "../server/live-instructions.js";
import OpenAI from "openai";
import { z } from "zod";
import { chestPainCaseV1 } from "../case/index.js";
import {
  CheckpointInputSchema,
  TextTurnInputSchema,
  TranscriptCorrectionInputSchema,
} from "../shared/contracts/conversation.js";
import {
  FinishRunInputSchema,
  type DebriefSnapshot,
} from "../shared/contracts/debrief.js";
import { CasePackSchema, toStudentCase } from "../shared/contracts/server.js";
import { CommandEnvelopeSchema } from "../shared/contracts/scenario.js";
import { StudentCaseSchema } from "../shared/contracts/student.js";
import {
  ConversationService,
  type ConversationPersistence,
} from "../server/conversation-service.js";
import { DebriefService } from "../server/debrief-service.js";
import {
  DeterministicExaminerProvider,
  OpenAIExaminerProvider,
} from "../server/examiner-provider.js";
import {
  ScenarioStore,
  type ScenarioStorePersistence,
} from "../server/scenario-store.js";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface SitesEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_LIVE_MODEL?: string;
  OPENAI_EXAMINER_MODEL?: string;
  APP_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  DB?: D1Database;
}

interface SitesExecutionContext {
  waitUntil(operation: Promise<unknown>): void;
}

interface RuntimePersistence {
  store: ScenarioStorePersistence;
  conversation: ConversationPersistence | null;
  debrief: DebriefSnapshot | null;
}

class D1RunPersistence {
  private initialized: Promise<void> | undefined;

  constructor(private readonly database: D1Database) {}

  async load(runId: string): Promise<RuntimePersistence | null> {
    await this.initialize();
    const row = await this.database
      .prepare("SELECT payload FROM simulator_runs WHERE id = ?")
      .bind(runId)
      .first<{ payload: string }>();
    return row ? (JSON.parse(row.payload) as RuntimePersistence) : null;
  }

  async save(runId: string, payload: RuntimePersistence) {
    await this.initialize();
    await this.database
      .prepare(
        "INSERT INTO simulator_runs (id, payload, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      )
      .bind(runId, JSON.stringify(payload), new Date().toISOString())
      .run();
  }

  private initialize() {
    this.initialized ??= this.database
      .prepare(
        "CREATE TABLE IF NOT EXISTS simulator_runs (" +
          "id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
      )
      .run()
      .then(() => undefined);
    return this.initialized;
  }
}

const LiveStatusSchema = z
  .object({
    sessionId: z.string().min(1),
    status: z.enum(["connected", "interrupted", "disconnected", "failed"]),
  })
  .strict();

class SitesRuntime {
  readonly casePack = CasePackSchema.parse(chestPainCaseV1);
  readonly studentCase = StudentCaseSchema.parse(toStudentCase(this.casePack));
  readonly store = new ScenarioStore(this.casePack, null);
  readonly openai: OpenAI | null;
  readonly conversation: ConversationService;
  readonly debrief: DebriefService;
  readonly liveModel: string;
  readonly examinerModel: string;
  readonly persistence: D1RunPersistence | null;

  constructor(readonly environment: SitesEnvironment) {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    this.liveModel = environment.OPENAI_LIVE_MODEL?.trim() || "gpt-live-1";
    this.examinerModel = environment.OPENAI_EXAMINER_MODEL?.trim() || "gpt-6-astra";
    this.openai = apiKey
      ? new OpenAI({ apiKey, maxRetries: 0, dangerouslyAllowBrowser: true })
      : null;
    const examiner = this.openai
      ? new OpenAIExaminerProvider(this.openai)
      : new DeterministicExaminerProvider();
    this.conversation = new ConversationService(
      this.casePack,
      this.store,
      this.examinerModel,
      examiner,
    );
    this.debrief = new DebriefService(this.casePack, this.store, this.conversation);
    this.persistence = environment.DB ? new D1RunPersistence(environment.DB) : null;
  }

  snapshot(runId: string): RuntimePersistence | null {
    const store = this.store.persistence(runId);
    if (!store) return null;
    return {
      store,
      conversation: this.conversation.persistence(runId),
      debrief: this.debrief.get(runId),
    };
  }

  restore(persisted: RuntimePersistence) {
    this.store.restore(persisted.store);
    this.conversation.restore(persisted.conversation);
    this.debrief.restore(persisted.debrief);
  }
}

let activeRuntime: SitesRuntime | undefined;

export function resetSitesRuntimeForTest() {
  activeRuntime = undefined;
}

function runtimeFor(environment: SitesEnvironment) {
  activeRuntime ??= new SitesRuntime(environment);
  return activeRuntime;
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function match(pathname: string, pattern: RegExp) {
  const result = pathname.match(pattern);
  return result?.slice(1).map((value) => decodeURIComponent(value));
}

function errorResponse(error: unknown, fallback: string, status = 422) {
  if (error instanceof OpenAI.APIError) {
    return json(
      {
        error: fallback,
        providerStatus: error.status ?? null,
        requestId: error.requestID ?? null,
      },
      error.status ?? 502,
    );
  }
  return json({ error: error instanceof Error ? error.message : fallback }, status);
}

async function apiResponse(
  request: Request,
  environment: SitesEnvironment,
  context: SitesExecutionContext,
) {
  const runtime = runtimeFor(environment);
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/health") {
    const configured = Boolean(runtime.openai);
    return json({
      status: "ok",
      runtime: "chatgpt-sites",
      persistence: "runtime-session",
      case: {
        id: runtime.casePack.caseId,
        version: runtime.casePack.caseVersion,
        clinicalReviewStatus: runtime.casePack.clinicalReview.reviewStatus,
      },
      providers: {
        live: { configured, mode: "real", model: runtime.liveModel },
        examiner: { configured, mode: runtime.openai ? "real" : "verification_fixture", model: runtime.examinerModel },
      },
    });
  }

  if (request.method === "GET" && path === "/api/cases/current")
    return json(runtime.studentCase);

  if (request.method === "POST" && ["/api/runs", "/api/fixtures"].includes(path)) {
    if (runtime.store.size >= 1000)
      return json({ error: "Scenario capacity reached; start a new hosted session." }, 503);
    return json(await runtime.store.create(), 201);
  }

  const runRoute = match(path, /^\/api\/(?:runs|fixtures)\/([^/]+)$/);
  if (request.method === "GET" && runRoute) {
    const state = runtime.store.get(runRoute[0]!);
    return state
      ? json(state)
      : json({ error: "Scenario session not found; reload to start a new session." }, 404);
  }

  const eventRoute = match(path, /^\/api\/(?:runs|fixtures)\/([^/]+)\/events$/);
  if (request.method === "GET" && eventRoute) {
    const events = runtime.store.events(eventRoute[0]!);
    return events ? json({ events }) : json({ error: "Scenario session not found." }, 404);
  }

  const exportRoute = match(path, /^\/api\/(?:runs|fixtures)\/([^/]+)\/export$/);
  if (request.method === "GET" && exportRoute) {
    const exported = runtime.store.export(exportRoute[0]!);
    return exported
      ? json(exported, 200, {
          "Content-Disposition": `attachment; filename="run-${exportRoute[0]}.json"`,
        })
      : json({ error: "Scenario session not found." }, 404);
  }

  const commandRoute = match(path, /^\/api\/(?:runs|fixtures)\/([^/]+)\/commands$/);
  if (request.method === "POST" && commandRoute) {
    const parsed = CommandEnvelopeSchema.safeParse(await requestBody(request));
    if (!parsed.success)
      return json({ error: "Invalid command envelope or malformed parameters." }, 400);
    const result = await runtime.store.execute(commandRoute[0]!, parsed.data);
    if (!result) return json({ error: "Scenario session not found." }, 404);
    return result.rejection
      ? json({ error: result.rejection.message, state: result.state }, result.rejection.status)
      : json(result.state);
  }

  const conversationRoute = match(path, /^\/api\/conversations\/([^/]+)$/);
  if (request.method === "GET" && conversationRoute) {
    if (!runtime.store.get(conversationRoute[0]!))
      return json({ error: "Scenario session not found." }, 404);
    return json(await runtime.conversation.state(conversationRoute[0]!));
  }

  const turnRoute = match(path, /^\/api\/conversations\/([^/]+)\/turns$/);
  if (request.method === "POST" && turnRoute) {
    const parsed = TextTurnInputSchema.safeParse(await requestBody(request));
    if (!parsed.success) return json({ error: "Invalid conversation turn." }, 400);
    if (!runtime.store.get(turnRoute[0]!))
      return json({ error: "Scenario session not found." }, 404);
    const result = await runtime.conversation.textTurn(turnRoute[0]!, parsed.data);
    return json({ ...result, state: runtime.store.get(turnRoute[0]!) });
  }

  const correctionRoute = match(path, /^\/api\/conversations\/([^/]+)\/corrections$/);
  if (request.method === "POST" && correctionRoute) {
    const parsed = TranscriptCorrectionInputSchema.safeParse(await requestBody(request));
    if (!parsed.success) return json({ error: "Invalid transcript correction." }, 400);
    try {
      return json(
        await runtime.conversation.correctTranscript(
          correctionRoute[0]!,
          parsed.data.messageId,
          parsed.data.text,
        ),
      );
    } catch (error) {
      return errorResponse(error, "Correction was rejected.");
    }
  }

  const draftRoute = match(path, /^\/api\/conversations\/([^/]+)\/draft\/clear$/);
  if (request.method === "POST" && draftRoute) {
    if (!runtime.store.get(draftRoute[0]!))
      return json({ error: "Scenario session not found." }, 404);
    return json(await runtime.conversation.clearMedicationDraft(draftRoute[0]!));
  }

  const liveStatusRoute = match(path, /^\/api\/conversations\/([^/]+)\/live\/status$/);
  if (request.method === "POST" && liveStatusRoute) {
    const parsed = LiveStatusSchema.safeParse(await requestBody(request));
    if (!parsed.success) return json({ error: "Invalid Live status update." }, 400);
    const accepted = await runtime.conversation.setLiveStatus(
      liveStatusRoute[0]!,
      parsed.data.sessionId,
      parsed.data.status,
    );
    return json({ accepted }, accepted ? 200 : 403);
  }

  const liveToolRoute = match(path, /^\/api\/conversations\/([^/]+)\/live\/tools\/([^/]+)$/);
  if (request.method === "POST" && liveToolRoute) {
    const sessionId = request.headers.get("x-live-session-id");
    if (!sessionId) return json({ error: "Live session identifier is required." }, 401);
    try {
      return json(
        await runtime.conversation.invokeLiveTool(
          liveToolRoute[0]!,
          sessionId,
          liveToolRoute[1]!,
          await requestBody(request),
        ),
      );
    } catch (error) {
      return errorResponse(error, "Live tool request rejected.", 403);
    }
  }

  const checkpointRoute = match(path, /^\/api\/conversations\/([^/]+)\/checkpoints$/);
  if (request.method === "POST" && checkpointRoute) {
    const parsed = CheckpointInputSchema.safeParse(await requestBody(request));
    if (!parsed.success) return json({ error: "Invalid examiner checkpoint." }, 400);
    if (!runtime.store.get(checkpointRoute[0]!))
      return json({ error: "Scenario session not found." }, 404);
    const checkpoint = await runtime.conversation.checkpoint(checkpointRoute[0]!, parsed.data);
    return json({
      checkpoint,
      conversation: await runtime.conversation.state(checkpointRoute[0]!),
    });
  }

  const debriefRoute = match(path, /^\/api\/debriefs\/([^/]+)$/);
  if (request.method === "GET" && debriefRoute) {
    if (!runtime.store.get(debriefRoute[0]!))
      return json({ error: "Scenario session not found." }, 404);
    const snapshot = runtime.debrief.get(debriefRoute[0]!);
    return snapshot
      ? json(snapshot)
      : json({ error: "Finish the run before opening the debrief." }, 409);
  }

  const finishRoute = match(path, /^\/api\/debriefs\/([^/]+)\/finish$/);
  if (request.method === "POST" && finishRoute) {
    const parsed = FinishRunInputSchema.safeParse(await requestBody(request));
    if (!parsed.success) return json({ error: "Invalid Finish payload." }, 400);
    try {
      return json(
        await runtime.debrief.startFinish(
          finishRoute[0]!,
          parsed.data,
          (operation) => context.waitUntil(operation),
        ),
        202,
      );
    } catch (error) {
      return errorResponse(
        error,
        "Finish failed.",
        error instanceof Error && /not found/.test(error.message) ? 404 : 422,
      );
    }
  }

  const retryRoute = match(path, /^\/api\/debriefs\/([^/]+)\/retry$/);
  if (request.method === "POST" && retryRoute) {
    try {
      return json(
        await runtime.debrief.startRetry(
          retryRoute[0]!,
          (operation) => context.waitUntil(operation),
        ),
        202,
      );
    } catch (error) {
      return errorResponse(error, "Evaluation retry failed.");
    }
  }

  const teachBackRoute = match(path, /^\/api\/debriefs\/([^/]+)\/teach-back$/);
  if (request.method === "POST" && teachBackRoute) {
    try {
      return json(await runtime.debrief.requestTeachBack(teachBackRoute[0]!));
    } catch (error) {
      return errorResponse(error, "Teach-back unavailable.");
    }
  }

  if (request.method === "POST" && path === "/api/live/session") {
    const expectedOrigin = environment.APP_ORIGIN?.trim() || url.origin;
    if (request.headers.get("origin") !== expectedOrigin)
      return json({ error: "Unexpected request origin" }, 403);
    const body = await requestBody(request) as { runId?: unknown; sdp?: unknown } | undefined;
    if (typeof body?.sdp !== "string" || !body.sdp.trim())
      return json({ error: "An SDP offer is required" }, 400);
    if (body.runId !== undefined && (typeof body.runId !== "string" || !runtime.store.get(body.runId)))
      return json({ error: "Scenario session not found" }, 404);
    if (!runtime.openai)
      return json({ error: "OPENAI_API_KEY is not configured on the Site." }, 503);
    try {
      const result = await runtime.openai.live.create({
        session: {
          model: runtime.liveModel,
          instructions: liveInstructions(runtime.casePack),
          delegation: { type: "client" },
          input: [
            {
              role: "assistant",
              content: [{ type: "output_text", text: runtime.casePack.voiceBriefing }],
              status: "completed",
            },
          ],
          client: {
            data_channel: {
              allowed_client_events: [
                "session.input_audio.mute",
                "session.input_audio.unmute",
                "session.commentary.append",
                "session.close",
              ],
              allowed_server_events: [
                { type: "session.started" },
                { type: "session.input_transcript.delta" },
                { type: "session.output_transcript.delta" },
                { type: "session.delegation.created" },
                { type: "session.closed" },
                { type: "error" },
                { type: "info" },
              ],
            },
          },
        },
        transport: { type: "webrtc", sdp: body.sdp },
      });
      const sessionId = (result as { session?: { id?: unknown } }).session?.id;
      if (typeof body.runId === "string" && typeof sessionId === "string")
        await runtime.conversation.registerLiveSession(body.runId, sessionId);
      return json(result, 201);
    } catch (error) {
      return errorResponse(error, "Live session creation failed", 502);
    }
  }

  return null;
}

async function runIdFor(request: Request, pathname: string) {
  const route = match(
    pathname,
    /^\/api\/(?:runs|fixtures|conversations|debriefs)\/([^/]+)/,
  );
  if (route) return route[0]!;
  if (request.method === "POST" && pathname === "/api/live/session") {
    const body = (await request.clone().json().catch(() => null)) as {
      runId?: unknown;
    } | null;
    return typeof body?.runId === "string" ? body.runId : null;
  }
  return null;
}

async function persistedApiResponse(
  request: Request,
  environment: SitesEnvironment,
  context: SitesExecutionContext,
) {
  const runtime = runtimeFor(environment);
  const pathname = new URL(request.url).pathname;
  let runId = await runIdFor(request, pathname);
  if (runId && runtime.persistence) {
    const persisted = await runtime.persistence.load(runId);
    if (persisted) runtime.restore(persisted);
  }

  const persistenceContext: SitesExecutionContext = {
    waitUntil(operation) {
      context.waitUntil(
        operation.then(async () => {
          if (!runId || !runtime.persistence) return;
          const snapshot = runtime.snapshot(runId);
          if (snapshot) await runtime.persistence.save(runId, snapshot);
        }),
      );
    },
  };
  const response = await apiResponse(request, environment, persistenceContext);
  if (!response) return null;

  if (
    !runId &&
    request.method === "POST" &&
    ["/api/runs", "/api/fixtures"].includes(pathname)
  ) {
    const created = (await response.clone().json()) as { id?: unknown };
    if (typeof created.id === "string") runId = created.id;
  }
  if (runId && runtime.persistence) {
    const snapshot = runtime.snapshot(runId);
    if (snapshot) await runtime.persistence.save(runId, snapshot);
  }
  return response;
}

export default {
  async fetch(
    request: Request,
    environment: SitesEnvironment,
    context: SitesExecutionContext,
  ) {
    const path = new URL(request.url).pathname;
    try {
      const response = await persistedApiResponse(request, environment, context);
      if (response) return response;
      if (path.startsWith("/api/"))
        return json({ error: "API endpoint not found." }, 404);
      if (environment.ASSETS) return environment.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (path.startsWith("/api/"))
        return errorResponse(error, "Unexpected server error.", 500);
      throw error;
    }
  },
};
