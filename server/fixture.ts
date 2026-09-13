import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  FixtureCommandSchema,
  type FixtureState,
} from "../shared/contracts/fixture.js";

// Interaction fixture only: no treatment effects, grading, or clinical eligibility engine.
export function fixtureRouter() {
  const router = Router();
  const runs = new Map<
    string,
    { state: FixtureState; requests: Map<string, string> }
  >();
  const envelope = z
    .object({
      revision: z.number().int().nonnegative(),
      key: z.uuid(),
      command: FixtureCommandSchema,
    })
    .strict();
  router.post("/", (_req, res) => {
    if (runs.size >= 1000) {
      res
        .status(503)
        .json({
          error: "Fixture capacity reached; restart the development server.",
        });
      return;
    }
    const state: FixtureState = {
      id: randomUUID(),
      revision: 0,
      mode: "fixture",
      simulationTimeMs: 0,
      pulseRate: 104,
      sensors: { ecg: false, spo2: false, cuff: false },
      measurements: { hr: null, spo2: null, rr: 20, bp: null },
      receipts: [],
    };
    runs.set(state.id, { state, requests: new Map() });
    res.status(201).json(state);
  });
  router.get("/:id", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) {
      res
        .status(404)
        .json({
          error: "Fixture session not found; reload to start a new session.",
        });
      return;
    }
    res.json(run.state);
  });
  router.post("/:id/commands", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Fixture session not found." });
      return;
    }
    const parsed = envelope.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid command, dose, unit, or route." });
      return;
    }
    const { key, revision, command } = parsed.data;
    const fingerprint = JSON.stringify(command);
    const previous = run.requests.get(key);
    if (previous) {
      if (previous !== fingerprint) {
        res
          .status(409)
          .json({ error: "Retry key already used for another command." });
        return;
      }
      res.json(run.state);
      return;
    }
    const state = run.state;
    if (revision !== state.revision) {
      res
        .status(409)
        .json({ error: "State changed; refresh and review before retrying." });
      return;
    }
    if (command.type === "measure_bp" && !state.sensors.cuff) {
      res.status(409).json({ error: "Connect the BP cuff first." });
      return;
    }
    if (command.type === "administer" && state.receipts.length) {
      res
        .status(409)
        .json({
          error: "This fixture supports one administration per session.",
        });
      return;
    }
    if (command.type === "sensor") {
      state.sensors[command.sensor] = command.connected;
      state.measurements.hr = state.sensors.ecg ? state.pulseRate : null;
      state.measurements.spo2 = state.sensors.spo2 ? 96 : null;
    } else if (command.type === "measure_bp") {
      state.measurements.bp = {
        value: "146/88",
        measuredAtMs: state.simulationTimeMs,
      };
    } else if (command.type === "advance") {
      state.simulationTimeMs += command.seconds * 1000;
    } else if (command.type === "administer") {
      state.receipts.push({
        ...command.order,
        id: randomUUID(),
        simulationTimeMs: state.simulationTimeMs,
        actor: "student",
        status: "administered",
        mode: "fixture",
      });
    }
    state.revision++;
    run.requests.set(key, fingerprint);
    res.json(state);
  });
  return router;
}
