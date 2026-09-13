import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { FixtureCommand } from "../shared/contracts/fixture.js";

describe("fixture interaction server", () => {
  async function session() {
    const app = createApp(loadConfig({}));
    let state = (await request(app).post("/api/fixtures").send({}).expect(201))
      .body;
    const command = async (command: FixtureCommand, status = 200) => {
      const result = await request(app)
        .post(`/api/fixtures/${state.id}/commands`)
        .send({ revision: state.revision, key: randomUUID(), command })
        .expect(status);
      if (status === 200) state = result.body;
      return result.body;
    };
    return {
      app,
      command,
      get state() {
        return state;
      },
    };
  }
  it("reveals connected measurements, retains aged BP and updates repeat measurements", async () => {
    const s = await session();
    expect(s.state.measurements).toMatchObject({
      hr: null,
      spo2: null,
      bp: null,
    });
    await s.command({ type: "measure_bp" }, 409);
    await s.command({ type: "sensor", sensor: "ecg", connected: true });
    expect(s.state.measurements.hr).toBe(s.state.pulseRate);
    await s.command({ type: "sensor", sensor: "spo2", connected: true });
    expect(s.state.measurements.spo2).toBe(96);
    await s.command({ type: "sensor", sensor: "cuff", connected: true });
    await s.command({ type: "measure_bp" });
    await s.command({ type: "advance", seconds: 30 });
    expect(
      s.state.simulationTimeMs - s.state.measurements.bp.measuredAtMs,
    ).toBe(30000);
    await s.command({ type: "sensor", sensor: "cuff", connected: false });
    expect(s.state.measurements.bp.value).toBe("146/88");
    await s.command({ type: "sensor", sensor: "ecg", connected: false });
    await s.command({ type: "sensor", sensor: "spo2", connected: false });
    expect(s.state.measurements).toMatchObject({ hr: null, spo2: null });
    await s.command({ type: "sensor", sensor: "cuff", connected: true });
    await s.command({ type: "measure_bp" });
    expect(s.state.measurements.bp.measuredAtMs).toBe(30000);
  });
  it("validates parameters and accepts exactly one receipt without changing physiology", async () => {
    const s = await session();
    const order = {
      drugId: "aspirin_300mg_tablet",
      dose: 300,
      unit: "mg",
      route: "oral",
    } as const;
    for (const invalid of [
      { ...order, dose: 0 },
      { ...order, unit: "" },
      { ...order, route: "iv" },
      { ...order, dose: "300" },
    ]) {
      await request(s.app)
        .post(`/api/fixtures/${s.state.id}/commands`)
        .send({
          revision: 0,
          key: randomUUID(),
          command: { type: "administer", order: invalid },
        })
        .expect(400);
    }
    const before = structuredClone(s.state.measurements);
    const key = randomUUID();
    const payload = {
      revision: 0,
      key,
      command: { type: "administer", order },
    };
    const url = `/api/fixtures/${s.state.id}/commands`;
    const accepted = await request(s.app).post(url).send(payload).expect(200);
    const retry = await request(s.app).post(url).send(payload).expect(200);
    expect(retry.body.receipts).toEqual(accepted.body.receipts);
    expect(accepted.body.measurements).toEqual(before);
    expect(accepted.body.receipts[0]).toMatchObject({
      ...order,
      mode: "fixture",
      actor: "student",
      status: "administered",
    });
    await request(s.app)
      .post(url)
      .send({ ...payload, command: { type: "advance", seconds: 1 } })
      .expect(409);
    await request(s.app)
      .post(url)
      .send({ ...payload, key: randomUUID() })
      .expect(409);
    await request(s.app)
      .post(url)
      .send({ ...payload, revision: 1, key: randomUUID() })
      .expect(409);
    const other = await request(s.app)
      .post("/api/fixtures")
      .send({})
      .expect(201);
    expect(other.body.receipts).toEqual([]);
  });
});
