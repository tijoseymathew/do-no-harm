import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import OpenAI from "openai";
import { chestPainCaseV1 } from "../case/index.js";
import { CasePackSchema, toStudentCase } from "../shared/contracts/server.js";
import { StudentCaseSchema } from "../shared/contracts/student.js";
import { requireOpenAIKey, type ServerConfig } from "./config.js";
import { fixtureRouter } from "./fixture.js";

interface LiveSessionCreator {
  create(input: {
    session: {
      model: string;
      instructions: string;
      delegation: { type: "client" };
    };
    transport: { type: "webrtc"; sdp: string };
  }): Promise<unknown>;
}

export interface AppDependencies {
  createLiveClient?: (apiKey: string) => LiveSessionCreator;
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
  app.use("/api/fixtures", fixtureRouter());

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

      const apiKey = requireOpenAIKey(config);
      const live = dependencies.createLiveClient
        ? dependencies.createLiveClient(apiKey)
        : new OpenAI({ apiKey, maxRetries: 0 }).live;
      const result = await live.create({
        session: {
          model: config.liveModel,
          instructions:
            "You are the patient in a clearly labeled formative clinical simulation. Speak briefly as Patient. This is an API connection probe: greet the learner, respond naturally, allow interruption, and do not invent examination findings or treatments.",
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp: request.body.sdp },
      });
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
