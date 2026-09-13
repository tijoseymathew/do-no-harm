import handler from "vinext/server/fetch-handler";
import simulator from "../sites/index.js";

interface Environment {
  OPENAI_API_KEY?: string;
  OPENAI_LIVE_MODEL?: string;
  OPENAI_EXAMINER_MODEL?: string;
  APP_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface ExecutionContext {
  waitUntil(operation: Promise<unknown>): void;
}

export default {
  fetch(
    request: Request,
    environment: Environment,
    context: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return simulator.fetch(request, environment, context);
    return handler.fetch(request, environment, context);
  },
};
