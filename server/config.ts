import { z } from "zod";

const OptionalPortSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "PORT must be an integer between 1 and 65535")
  .transform(Number)
  .pipe(z.number().int().min(1).max(65535));

export interface ServerConfig {
  port: number;
  allowedOrigins: string[];
  openaiApiKey?: string;
  liveModel: string;
  examinerModel: string;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const portValue = nonBlank(environment.PORT);
  const originValue = nonBlank(environment.APP_ORIGIN);

  return {
    port: portValue ? OptionalPortSchema.parse(portValue) : 3000,
    allowedOrigins: originValue
      ? originValue.split(",").map((origin) => z.url().parse(origin.trim()))
      : ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:3000"],
    openaiApiKey: nonBlank(environment.OPENAI_API_KEY),
    liveModel: nonBlank(environment.OPENAI_LIVE_MODEL) ?? "gpt-live-1",
    examinerModel: nonBlank(environment.OPENAI_EXAMINER_MODEL) ?? "gpt-6-astra",
  };
}

export function requireOpenAIKey(config: ServerConfig): string {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Copy .env.example to .env and set the server-only key.");
  }
  return config.openaiApiKey;
}
