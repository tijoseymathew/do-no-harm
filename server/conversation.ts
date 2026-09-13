import { Router } from "express";
import { z } from "zod";
import {
  CheckpointInputSchema,
  TextTurnInputSchema,
  TranscriptCorrectionInputSchema,
} from "../shared/contracts/conversation.js";
import { ConversationService } from "./conversation-service.js";
import { ScenarioStore } from "./scenario-store.js";

export function conversationRouter(
  conversation: ConversationService,
  store: ScenarioStore,
) {
  const router = Router();

  router.get("/:id", async (request, response) => {
    if (!store.get(request.params.id)) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    response.json(await conversation.state(request.params.id));
  });

  router.post("/:id/turns", async (request, response) => {
    const parsed = TextTurnInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid conversation turn." });
      return;
    }
    if (!store.get(request.params.id)) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    const result = await conversation.textTurn(request.params.id, parsed.data);
    response.json({ ...result, state: store.get(request.params.id) });
  });

  router.post("/:id/corrections", async (request, response) => {
    const parsed = TranscriptCorrectionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid transcript correction." });
      return;
    }
    try {
      const snapshot = await conversation.correctTranscript(
        request.params.id,
        parsed.data.messageId,
        parsed.data.text,
      );
      response.json(snapshot);
    } catch (error) {
      response.status(422).json({
        error: error instanceof Error ? error.message : "Correction was rejected.",
      });
    }
  });

  router.post("/:id/draft/clear", async (request, response) => {
    if (!store.get(request.params.id)) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    response.json(await conversation.clearMedicationDraft(request.params.id));
  });

  router.post("/:id/live/status", async (request, response) => {
    const parsed = z
      .object({
        sessionId: z.string().min(1),
        status: z.enum(["connected", "interrupted", "disconnected", "failed"]),
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Live status update." });
      return;
    }
    const accepted = await conversation.setLiveStatus(
      request.params.id,
      parsed.data.sessionId,
      parsed.data.status,
    );
    response.status(accepted ? 200 : 403).json({ accepted });
  });

  router.post("/:id/live/tools/:name", async (request, response) => {
    const sessionId = request.header("x-live-session-id");
    if (!sessionId) {
      response.status(401).json({ error: "Live session identifier is required." });
      return;
    }
    try {
      const result = await conversation.invokeLiveTool(
        request.params.id,
        sessionId,
        request.params.name,
        request.body,
      );
      response.json(result);
    } catch (error) {
      response.status(403).json({
        error: error instanceof Error ? error.message : "Live tool request rejected.",
      });
    }
  });

  router.post("/:id/checkpoints", async (request, response) => {
    const parsed = CheckpointInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid examiner checkpoint." });
      return;
    }
    if (!store.get(request.params.id)) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    const checkpoint = await conversation.checkpoint(request.params.id, parsed.data);
    response.json({ checkpoint, conversation: await conversation.state(request.params.id) });
  });

  return router;
}
