import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { loadConfig, requireOpenAIKey } from "../server/config.js";

interface PendingFunctionCall {
  type: "function_call";
  turn_id: string;
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface SessionEventShape {
  type?: string;
  session?: {
    id?: string;
    required_actions?: PendingFunctionCall[];
  };
  item?: {
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

function opaqueId(value: string | undefined): string | null {
  if (!value) return null;
  return value.length <= 12 ? "<redacted>" : `${value.slice(0, 5)}…${value.slice(-5)}`;
}

const config = loadConfig();
const client = new OpenAI({ apiKey: requireOpenAIKey(config), maxRetries: 0 });
const startedAt = new Date().toISOString();
const eventTypes: string[] = [];
const toolReceipts: Array<Record<string, unknown>> = [];
const outputText: string[] = [];
let sessionId: string | undefined;

const events = await client.beta.agents.sessions.create({
  agent: {
    model: config.examinerModel,
    instructions:
      "This is an API integration proof. You must call get_visible_state exactly once before answering. After its result, briefly state the heart-rate value and that it came from application state.",
    tools: [
      {
        type: "function",
        name: "get_visible_state",
        description: "Returns the currently student-visible simulated observations.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    ],
  },
  environment: { type: "none" },
  input: "Inspect the visible state using the application function, then report the heart rate.",
  stream: true,
});

try {
  for await (const rawEvent of events) {
    const event = rawEvent as SessionEventShape;
    const eventType = event.type ?? "unknown";
    eventTypes.push(eventType);
    sessionId ??= event.session?.id;

    if (eventType === "agent.session.requires_action") {
      if (!sessionId) throw new Error("Provider requested an action without a session ID");
      const actions = event.session?.required_actions ?? [];
      for (const action of actions) {
        if (action.type !== "function_call" || action.name !== "get_visible_state") {
          throw new Error(`Unexpected required action: ${action.name ?? action.type}`);
        }
        const output = JSON.stringify({ observations: [{ id: "heart_rate", value: 104, unit: "beats/min" }] });
        await client.beta.agents.sessions.events.create(sessionId, {
          events: [
            {
              type: "agent.session.input.tool_result",
              turn_id: action.turn_id,
              call_id: action.call_id,
              success: true,
              output,
            },
          ],
        });
        toolReceipts.push({
          name: action.name,
          callId: opaqueId(action.call_id),
          arguments: action.arguments,
          result: JSON.parse(output),
          success: true,
        });
      }
    }

    for (const content of event.item?.content ?? []) {
      if (content.type === "output_text" && content.text) outputText.push(content.text);
    }
  }
} finally {
  events.controller.abort();
}

if (!sessionId || toolReceipts.length !== 1) {
  throw new Error(`Real examiner proof failed: observed ${toolReceipts.length} application function calls`);
}

const receipt = {
  schemaVersion: "1.0.0",
  provider: "OpenAI Agents API",
  mode: "real",
  mocked: false,
  model: config.examinerModel,
  sessionId: opaqueId(sessionId),
  startedAt,
  completedAt: new Date().toISOString(),
  eventTypes,
  toolReceipts,
  outputText: outputText.join("\n"),
};
const evidenceDirectory = join(process.cwd(), "docs", "evidence");
await mkdir(evidenceDirectory, { recursive: true });
const receiptPath = join(evidenceDirectory, "examiner-session-receipt.json");
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(`Real Agents API proof passed; sanitized receipt: ${receiptPath}`);
