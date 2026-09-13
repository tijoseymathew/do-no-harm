import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig({});

describe("application API boundary", () => {
  it("reports provider configuration without credentials", async () => {
    const response = await request(createApp(config)).get("/api/health").expect(200);
    expect(response.body.providers.live).toEqual({ configured: false, mode: "real", model: "gpt-live-1" });
    expect(JSON.stringify(response.body)).not.toContain("apiKey");
    expect(JSON.stringify(response.body)).not.toContain("OPENAI_API_KEY");
  });

  it("returns only the student-visible case", async () => {
    const response = await request(createApp(config)).get("/api/cases/current").expect(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("hiddenRubric");
    expect(serialized).not.toContain("referenceDoseRule");
    expect(serialized).not.toContain("sinus tachycardia");
    expect(serialized).not.toContain("18 ng/L");
  });

  it("gives an actionable error when provider configuration is missing", async () => {
    const response = await request(createApp(config))
      .post("/api/live/session")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ sdp: "valid-looking-offer" })
      .expect(503);
    expect(response.body.error).toContain("OPENAI_API_KEY");
  });

  it("validates origin and SDP before calling the provider", async () => {
    const create = vi.fn();
    const configured = loadConfig({ OPENAI_API_KEY: "test-only-placeholder" });
    const app = createApp(configured, { createLiveClient: () => ({ create }) });

    await request(app).post("/api/live/session").set("Origin", "https://unexpected.example").send({ sdp: "offer" }).expect(403);
    await request(app).post("/api/live/session").set("Origin", "http://127.0.0.1:5173").send({}).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("binds permitted Live tools to the provider session and run", async () => {
    const create = vi.fn().mockResolvedValue({
      session: { id: "live-session-one" },
      transport: { type: "webrtc", sdp: "answer" },
    });
    const configured = loadConfig({ OPENAI_API_KEY: "test-only-placeholder" });
    const app = createApp(configured, {
      createLiveClient: () => ({ create }),
    });
    const run = await request(app).post("/api/runs").send({}).expect(201);

    await request(app)
      .post("/api/live/session")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ runId: run.body.id, sdp: "offer" })
      .expect(201);
    expect(create.mock.calls[0]![0].session.instructions).toContain(
      "delegate fact, visible-state, and draft-action requests",
    );

    const fact = await request(app)
      .post(`/api/conversations/${run.body.id}/live/tools/get_case_fact`)
      .set("x-live-session-id", "live-session-one")
      .send({ key: "symptom_onset" })
      .expect(200);
    expect(fact.body.value).toContain("45 minutes");

    await request(app)
      .post(`/api/conversations/${run.body.id}/live/tools/submit_examiner_output`)
      .set("x-live-session-id", "live-session-one")
      .send({})
      .expect(403);
    await request(app)
      .post(`/api/conversations/${run.body.id}/live/tools/get_visible_state`)
      .set("x-live-session-id", "different-session")
      .send({})
      .expect(403);
  });
});
