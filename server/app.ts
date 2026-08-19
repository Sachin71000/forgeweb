import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import { ApiError } from "./lib.ts";
import { BuildWorkflow } from "./workflow.ts";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, jsonHeaders);
  response.end(JSON.stringify(body));
}

function streamBuildEvents(request: IncomingMessage, response: ServerResponse, workflow: BuildWorkflow, buildId: string): void {
  workflow.get(buildId);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();
  let sent = 0;
  let timer: NodeJS.Timeout | undefined;
  const publish = () => {
    const build = workflow.get(buildId);
    for (const event of build.events.slice(sent)) {
      response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    sent = build.events.length;
    if (["awaiting_confirmation", "completed", "failed", "needs_context"].includes(build.status)) {
      if (timer) clearInterval(timer);
      response.end();
    }
  };
  publish();
  if (!response.writableEnded) timer = setInterval(publish, 150);
  request.on("close", () => {
    if (timer) clearInterval(timer);
  });
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds 64 KiB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export type ForgeWebRequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export function createForgeWebRequestHandler(workflow: BuildWorkflow): ForgeWebRequestHandler {
  return async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";
    try {
      if (method === "GET" && requestUrl.pathname === "/api/health") {
        send(response, 200, { status: "ok", service: "forgeweb-control-plane", time: new Date().toISOString() });
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/projects") {
        send(response, 200, { projects: workflow.listProjects() });
        return;
      }
      if (method === "POST" && requestUrl.pathname === "/api/builds") {
        const payload = await body(request) as { prompt?: unknown };
        const build = await workflow.create(payload.prompt);
        send(response, 202, { build });
        return;
      }
      const buildEventsMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/events$/);
      if (method === "GET" && buildEventsMatch) {
        streamBuildEvents(request, response, workflow, decodeURIComponent(buildEventsMatch[1]));
        return;
      }
      const buildConfirmationMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/confirm$/);
      if (method === "POST" && buildConfirmationMatch) {
        const build = await workflow.confirm(decodeURIComponent(buildConfirmationMatch[1]));
        send(response, 202, { build });
        return;
      }
      const buildMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)$/);
      if (method === "GET" && buildMatch) {
        send(response, 200, { build: workflow.get(decodeURIComponent(buildMatch[1])) });
        return;
      }
      const projectMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (method === "GET" && projectMatch) {
        send(response, 200, workflow.getProject(decodeURIComponent(projectMatch[1])));
        return;
      }
      send(response, 404, { error: { code: "NOT_FOUND", message: "API route was not found." } });
    } catch (error) {
      if (error instanceof ApiError) {
        send(response, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      console.error(error);
      send(response, 500, { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
    }
  };
}

export function createForgeWebServer(workflow: BuildWorkflow): Server {
  const handler = createForgeWebRequestHandler(workflow);
  return createServer((request, response) => {
    void handler(request, response);
  });
}
