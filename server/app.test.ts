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
    expect(serialized).not.toContain("twelve_lead_ecg");
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
});
