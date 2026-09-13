import { describe, expect, it } from "vitest";
import worker from "./index.js";

const environment = {};
const context = { waitUntil: (_operation: Promise<unknown>) => undefined };

async function call(path: string, body?: unknown) {
  return worker.fetch(
    new Request(`https://example.test${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
    environment,
    context,
  );
}

describe("ChatGPT Sites worker", () => {
  it("reports the hosted runtime and serves the student-safe case", async () => {
    const health = await call("/api/health");
    const healthBody = await health.json();
    expect(health.status).toBe(200);
    expect(healthBody).toMatchObject({
      status: "ok",
      runtime: "chatgpt-sites",
      providers: { examiner: { configured: false, mode: "verification_fixture" } },
    });

    const caseResponse = await call("/api/cases/current");
    const caseBody = await caseResponse.json();
    expect(caseResponse.status).toBe(200);
    expect(caseBody).toMatchObject({ educationalUse: "formative_simulation_only" });
    expect(JSON.stringify(caseBody)).not.toContain("hiddenRubric");
  });

  it("keeps a scenario and its conversation available across worker requests", async () => {
    const created = await call("/api/runs", {});
    const run = await created.json() as { id: string; revision: number };
    expect(created.status).toBe(201);

    const conversation = await call(`/api/conversations/${run.id}`);
    expect(conversation.status).toBe(200);
    expect(await conversation.json()).toMatchObject({ runId: run.id });

    const updated = await call(`/api/runs/${run.id}/commands`, {
      revision: run.revision,
      idempotencyKey: crypto.randomUUID(),
      command: { type: "sensor", sensor: "ecg", connected: true },
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ sensors: { ecg: true } });
  });

  it("returns JSON for unknown API routes instead of falling through to static hosting", async () => {
    const response = await call("/api/not-a-route");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "API endpoint not found." });
  });
});
