import { Router } from "express";
import { FinishRunInputSchema } from "../shared/contracts/debrief.js";
import { DebriefService } from "./debrief-service.js";
import { ScenarioStore } from "./scenario-store.js";

export function debriefRouter(debrief: DebriefService, store: ScenarioStore) {
  const router = Router();

  router.get("/:id", (request, response) => {
    if (!store.get(request.params.id)) return void response.status(404).json({ error: "Scenario session not found." });
    const snapshot = debrief.get(request.params.id);
    if (!snapshot) return void response.status(409).json({ error: "Finish the run before opening the debrief." });
    response.json(snapshot);
  });

  router.post("/:id/finish", async (request, response) => {
    const parsed = FinishRunInputSchema.safeParse(request.body);
    if (!parsed.success) return void response.status(400).json({ error: "Invalid Finish payload." });
    try {
      response.status(202).json(await debrief.startFinish(request.params.id, parsed.data));
    } catch (error) {
      response.status(error instanceof Error && /not found/.test(error.message) ? 404 : 422).json({ error: error instanceof Error ? error.message : "Finish failed." });
    }
  });

  router.post("/:id/retry", async (request, response) => {
    try {
      response.status(202).json(await debrief.startRetry(request.params.id));
    } catch (error) {
      response.status(422).json({ error: error instanceof Error ? error.message : "Evaluation retry failed." });
    }
  });

  router.post("/:id/teach-back", async (request, response) => {
    try {
      response.json(await debrief.requestTeachBack(request.params.id));
    } catch (error) {
      response.status(422).json({ error: error instanceof Error ? error.message : "Teach-back unavailable." });
    }
  });

  return router;
}
