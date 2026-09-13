import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import OpenAI from "openai";
import { chestPainCaseV1 } from "../case/index.js";
import { CasePackSchema, toStudentCase } from "../shared/contracts/server.js";
import { StudentCaseSchema } from "../shared/contracts/student.js";
import { requireOpenAIKey, type ServerConfig } from "./config.js";
import { conversationRouter } from "./conversation.js";
import { ConversationService } from "./conversation-service.js";
import { DebriefService } from "./debrief-service.js";
import { debriefRouter } from "./debrief.js";
import {
  DeterministicExaminerProvider,
  OpenAIExaminerProvider,
  type ExaminerProvider,
} from "./examiner-provider.js";
import { scenarioRouter } from "./scenario.js";
import { ScenarioStore } from "./scenario-store.js";

interface LiveSessionCreator {
  create(input: {
    session: {
      model: string;
      instructions: string;
      delegation: { type: "client" };
      input?: Array<unknown>;
      client?: {
        data_channel: {
          allowed_client_events: string[];
          allowed_server_events: Array<{ type: string }>;
        };
      };
    };
    transport: { type: "webrtc"; sdp: string };
  }): Promise<unknown>;
}

export interface AppDependencies {
  createLiveClient?: (apiKey: string) => LiveSessionCreator;
  examinerProvider?: ExaminerProvider;
  runDirectory?: string;
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function createApp(config: ServerConfig, dependencies: AppDependencies = {}) {
  const app = express();
  const casePack = CasePackSchema.parse(chestPainCaseV1);
  const studentCase = StudentCaseSchema.parse(toStudentCase(casePack));

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  const store = new ScenarioStore(casePack, dependencies.runDirectory);
  const examinerProvider =
    dependencies.examinerProvider ??
    (config.openaiApiKey
      ? new OpenAIExaminerProvider(
          new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 0 }),
        )
      : new DeterministicExaminerProvider());
  const conversation = new ConversationService(
    casePack,
    store,
    config.examinerModel,
    examinerProvider,
  );
  const debrief = new DebriefService(casePack, store, conversation);
  const runs = scenarioRouter(casePack, dependencies.runDirectory, store);
  app.use("/api/runs", runs);
  app.use("/api/fixtures", runs);
  app.use("/api/conversations", conversationRouter(conversation, store));
  app.use("/api/debriefs", debriefRouter(debrief, store));

  app.get("/api/health", (_request, response) => {
    const configured = Boolean(config.openaiApiKey);
    response.json({
      status: "ok",
      case: {
        id: casePack.caseId,
        version: casePack.caseVersion,
        clinicalReviewStatus: casePack.clinicalReview.reviewStatus,
      },
      providers: {
        live: { configured, mode: "real", model: config.liveModel },
        examiner: { configured, mode: "real", model: config.examinerModel },
      },
    });
  });

  app.get("/api/cases/current", (_request, response) => {
    response.json(studentCase);
  });

  app.post(
    "/api/live/session",
    asyncRoute(async (request, response) => {
      const origin = request.headers.origin;
      if (!origin || !config.allowedOrigins.includes(origin)) {
        response.status(403).json({ error: "Unexpected request origin" });
        return;
      }
      if (typeof request.body?.sdp !== "string" || !request.body.sdp.trim()) {
        response.status(400).json({ error: "An SDP offer is required" });
        return;
      }
      if (request.body.runId !== undefined && !store.get(request.body.runId)) {
        response.status(404).json({ error: "Scenario session not found" });
        return;
      }

      const apiKey = requireOpenAIKey(config);
      const live = dependencies.createLiveClient
        ? dependencies.createLiveClient(apiKey)
        : new OpenAI({ apiKey, maxRetries: 0 }).live;
      const result = await live.create({
        session: {
          model: config.liveModel,
          instructions:
            "You facilitate a clearly labeled formative clinical simulation. When the application appends the authored Nurse briefing, speak it verbatim before accepting clinical questions. Thereafter label your role in speech, keep Patient answers brief, allow interruptions, and delegate fact, visible-state, and draft-action requests to the application. Never invent findings, reveal a rubric, recommend a next action, or claim treatment was performed.",
          delegation: { type: "client" },
          input: [
            {
              role: "assistant",
              content: [{ type: "output_text", text: casePack.voiceBriefing }],
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
        transport: { type: "webrtc", sdp: request.body.sdp },
      });
      const sessionId = (result as { session?: { id?: unknown } }).session?.id;
      if (request.body.runId && typeof sessionId === "string")
        await conversation.registerLiveSession(request.body.runId, sessionId);
      response.status(201).json(result);
    }),
  );

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof OpenAI.APIError) {
      response.status(error.status ?? 502).json({
        error: "Live session creation failed",
        providerStatus: error.status ?? null,
        requestId: error.requestID ?? null,
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    response.status(message.startsWith("OPENAI_API_KEY") ? 503 : 500).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}
