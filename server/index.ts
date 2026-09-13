import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const config = loadConfig();
const app = createApp(config);
const clientDirectory = join(process.cwd(), "dist", "client");

if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory));
  app.get("*path", (_request, response) => response.sendFile(join(clientDirectory, "index.html")));
}

app.listen(config.port, "127.0.0.1", () => {
  console.log(`DO NO HARM server listening on http://127.0.0.1:${config.port}`);
  if (!config.openaiApiKey) {
    console.warn("Provider probes unavailable: set OPENAI_API_KEY on the server (see .env.example).");
  }
});
