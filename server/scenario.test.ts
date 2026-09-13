import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { ScenarioCommand } from "../shared/contracts/scenario.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function session() {
  const runDirectory = await mkdtemp(path.join(tmpdir(), "dnh-runs-"));
  temporaryDirectories.push(runDirectory);
  const app = createApp(loadConfig({}), { runDirectory });
  let state = (await request(app).post("/api/runs").send({}).expect(201)).body;
  const command = async (command: ScenarioCommand, status = 200, key = randomUUID()) => {
    const response = await request(app)
      .post(`/api/runs/${state.id}/commands`)
      .send({ revision: state.revision, idempotencyKey: key, command })
      .expect(status);
    if (response.body.state) state = response.body.state;
    else if (status === 200) state = response.body;
    return response;
  };
  return {
    app,
    runDirectory,
    command,
    get state() {
      return state;
    },
  };
}

describe("scenario API and run persistence", () => {
  it("serializes simultaneous mutations, rejects the stale one, and records evidence", async () => {
    const run = await session();
    const url = `/api/runs/${run.state.id}/commands`;
    const revision = run.state.revision;
    const [first, second] = await Promise.all([
      request(run.app).post(url).send({
        revision,
        idempotencyKey: randomUUID(),
        command: { type: "sensor", sensor: "ecg", connected: true },
      }),
      request(run.app).post(url).send({
        revision,
        idempotencyKey: randomUUID(),
        command: { type: "sensor", sensor: "spo2", connected: true },
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const current = await request(run.app).get(`/api/runs/${run.state.id}`).expect(200);
    expect(Number(current.body.sensors.ecg) + Number(current.body.sensors.spo2)).toBe(1);
    const events = await request(run.app)
      .get(`/api/runs/${run.state.id}/events`)
      .expect(200);
    expect(events.body.events.at(-1)).toMatchObject({
      type: "command.rejected",
      stateVersion: 1,
    });
  });

  it("deduplicates a lost acknowledgement and persists a replayable JSONL run", async () => {
    const run = await session();
    await run.command({
      type: "confirm_medication_checks",
      allergyHistoryReviewed: true,
      administrationHistoryReviewed: true,
    });
    const key = randomUUID();
    await run.command({
      type: "prepare_medication",
      order: {
        drugId: "aspirin_300mg_tablet",
        dose: 300,
        unit: "mg",
        route: "oral",
      },
    });
    const command = {
      type: "administer_prepared",
      preparedOrderId: run.state.treatments.preparedOrders.at(-1).id,
    } as const;
    const first = await run.command(command, 200, key);
    const retry = await request(run.app)
      .post(`/api/runs/${run.state.id}/commands`)
      .send({ revision: 0, idempotencyKey: key, command })
      .expect(200);
    expect(retry.body.receipts).toEqual(first.body.receipts);
    expect(retry.body.receipts).toHaveLength(1);
    await request(run.app)
      .post(`/api/runs/${run.state.id}/commands`)
      .send({
        revision: run.state.revision,
        idempotencyKey: key,
        command: { type: "advance", seconds: 1 },
      })
      .expect(409);
    const events = await request(run.app)
      .get(`/api/runs/${run.state.id}/events`)
      .expect(200);
    expect(
      events.body.events.filter(
        ({ type }: { type: string }) => type === "medication.administered",
      ),
    ).toHaveLength(1);

    const contents = await readFile(
      path.join(run.runDirectory, `${run.state.id}.jsonl`),
      "utf8",
    );
    const records = contents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { recordType: string });
    expect(records[0]?.recordType).toBe("case_snapshot");
    expect(records.some(({ recordType }) => recordType === "event")).toBe(true);
    expect(records.at(-1)?.recordType).toBe("state_snapshot");
  });

  it("rejects malformed envelopes before mutation and isolates fresh runs", async () => {
    const run = await session();
    await request(run.app)
      .post(`/api/runs/${run.state.id}/commands`)
      .send({
        revision: 0,
        idempotencyKey: randomUUID(),
        command: {
          type: "prepare_medication",
          order: {
            drugId: "aspirin_300mg_tablet",
            dose: "300",
            unit: "mg",
            route: "oral",
          },
        },
      })
      .expect(400);
    const fresh = await request(run.app).post("/api/runs").send({}).expect(201);
    expect(fresh.body.id).not.toBe(run.state.id);
    expect(fresh.body.receipts).toEqual([]);
    expect(fresh.body.clock.simulationTimeMs).toBe(0);
  });

  it("exports the complete student run without hidden case rules", async () => {
    const run = await session();
    await run.command({ type: "save_note", content: "Assessment saved." });
    const response = await request(run.app)
      .get(`/api/runs/${run.state.id}/export`)
      .expect("Content-Disposition", /attachment; filename="run-/)
      .expect(200);
    expect(response.body).toMatchObject({
      exportVersion: "1.0.0",
      case: { id: "adult_chest_pain" },
      state: { id: run.state.id },
    });
    expect(response.body.events.some(({ type }: { type: string }) => type === "note.saved")).toBe(true);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("hiddenRubric");
    expect(serialized).not.toContain("referenceDoseRule");
  });
});
