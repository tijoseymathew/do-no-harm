import { Router } from "express";
import type { CasePack } from "../shared/contracts/server.js";
import { CommandEnvelopeSchema } from "../shared/contracts/scenario.js";
import { ScenarioStore } from "./scenario-store.js";

export function scenarioRouter(casePack: CasePack, runDirectory?: string) {
  const router = Router();
  const store = new ScenarioStore(casePack, runDirectory);

  router.post("/", async (_request, response) => {
    if (store.size >= 1000) {
      response.status(503).json({
        error: "Scenario capacity reached; restart the development server.",
      });
      return;
    }
    response.status(201).json(await store.create());
  });

  router.get("/:id", (request, response) => {
    const state = store.get(request.params.id);
    if (!state) {
      response.status(404).json({
        error: "Scenario session not found; reload to start a new session.",
      });
      return;
    }
    response.json(state);
  });

  router.get("/:id/events", (request, response) => {
    const events = store.events(request.params.id);
    if (!events) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    response.json({ events });
  });

  router.get("/:id/export", (request, response) => {
    const exported = store.export(request.params.id);
    if (!exported) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    response
      .setHeader("Content-Disposition", `attachment; filename="run-${request.params.id}.json"`)
      .json(exported);
  });

  router.post("/:id/commands", async (request, response) => {
    const parsed = CommandEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid command envelope or malformed parameters.",
      });
      return;
    }
    const result = await store.execute(request.params.id, parsed.data);
    if (!result) {
      response.status(404).json({ error: "Scenario session not found." });
      return;
    }
    if (result.rejection) {
      response.status(result.rejection.status).json({
        error: result.rejection.message,
        state: result.state,
      });
      return;
    }
    response.json(result.state);
  });

  return router;
}
