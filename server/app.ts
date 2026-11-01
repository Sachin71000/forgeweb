import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import { ApiError } from "./lib.ts";
import { BuildWorkflow } from "./workflow.ts";
import { MAX_STITCH_ZIP } from "./providers/stitch-zip.ts";
import { McpConnections } from './mcp-connections.ts';
import {ProjectRuntime} from './project-runtime.ts';
import {resolve} from 'node:path';

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

function sendPreview(response: ServerResponse, html: string, versionId: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "x-content-type-options": "nosniff",
    "x-forgeweb-version": versionId,
  });
  response.end(html);
}

function sendArchive(response: ServerResponse, archive: Buffer, filename: string): void {
  response.writeHead(200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": archive.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(archive);
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
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Request body must use application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds 64 KiB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  return parsed;
}

function checkRequestOrigin(request: IncomingMessage, opaquePreviewAsset=false): void {
  const host = request.headers.host;
  if (!host) throw new ApiError(400, "INVALID_HOST", "Host header is required.");
  let target: URL;
  const protocol = (request.socket as typeof request.socket & { encrypted?: boolean }).encrypted ? "https:" : "http:";
  try { target = new URL(`${protocol}//${host}`); }
  catch { throw new ApiError(400, "INVALID_HOST", "Invalid Host header."); }
  // The control plane is local-only. Reject rebinding to arbitrary DNS names.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new ApiError(403, "UNTRUSTED_HOST", "This local server only accepts loopback hosts.");
  }
  const origin = request.headers.origin;
  if (origin && origin !== target.origin && !(origin==='null'&&opaquePreviewAsset&&request.method==='GET')) throw new ApiError(403, "CROSS_ORIGIN_REQUEST", "Cross-origin API requests are not allowed.");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET") && request.headers["sec-fetch-site"] === "cross-site") {
    throw new ApiError(403, "CROSS_ORIGIN_REQUEST", "Cross-site changes are not allowed.");
  }
}

export type ForgeWebRequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export function createForgeWebRequestHandler(workflow: BuildWorkflow, mcp = new McpConnections(), runtime = new ProjectRuntime(workflow.workspace,resolve(process.env.FORGEWEB_DATA_DIR??'.forgeweb-data'))): ForgeWebRequestHandler {
  return async (request, response) => {
    const method = request.method ?? "GET";
    try {
      // Opaque sandbox frames may read only compiled static assets, never control-plane APIs.
      checkRequestOrigin(request, /^\/api\/builds\/[\w-]+\/partial-preview\/[^/]+\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|png|jpe?g|webp|svg)$/.test((request.url??'').split('?')[0]));
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      try { decodeURIComponent(requestUrl.pathname); }
      catch { throw new ApiError(400, "INVALID_URL_ENCODING", "Request path contains invalid URL encoding."); }
      if(method==='GET'&&requestUrl.pathname==='/api/storage'){send(response,200,{storage:workflow.storageInfo()});return;}
      const validateRuntimeMatch=requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/runtime\/validate$/);
      if(method==='POST'&&validateRuntimeMatch){const payload=await body(request) as {versionId?:unknown};if(typeof payload.versionId!=='string'||!payload.versionId)throw new ApiError(400,'VERSION_REQUIRED','Select a project version before validation.');send(response,200,{workspace:await runtime.validate(decodeURIComponent(validateRuntimeMatch[1]),payload.versionId)});return;}
      const runtimeMatch=requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/(runtime|storage)$/);
      if(runtimeMatch){
        const projectId=decodeURIComponent(runtimeMatch[1]);
        if(runtimeMatch[2]==='storage'&&method==='GET'){send(response,200,{storage:await runtime.storage(projectId,requestUrl.searchParams.get('collection')??'',Number(requestUrl.searchParams.get('offset')??0))});return;}
        if(runtimeMatch[2]==='runtime'){
          if(method==='GET'){send(response,200,{runtime:await runtime.status(projectId)});return;}
          if(method==='POST'){const payload=await body(request) as {versionId?:unknown};if(typeof payload.versionId!=='string'||!payload.versionId)throw new ApiError(400,'VERSION_REQUIRED','Select a project version before starting.');send(response,200,{runtime:await runtime.start(projectId,payload.versionId)});return;}
          if(method==='DELETE'){send(response,200,{runtime:await runtime.stop(projectId)});return;}
        }
      }
      if(method==='GET'&&requestUrl.pathname==='/api/mcp'){
        send(response,200,{servers:mcp.list(),mode:'reference-read-only'});return;
      }
      const mcpReadMatch=requestUrl.pathname.match(/^\/api\/mcp\/([a-z0-9-]{1,48})\/(read|select)$/);
      if(method==='POST'&&mcpReadMatch){
        const payload=await body(request);
        if(mcpReadMatch[2]==='read')send(response,200,{server:await mcp.read(mcpReadMatch[1],payload)});
        else {mcp.select(mcpReadMatch[1],(payload as {enabled?:unknown}).enabled);send(response,200,{servers:mcp.list()});}
        return;
      }
      const mcpMatch=requestUrl.pathname.match(/^\/api\/mcp\/([a-z0-9-]{1,48})(\/connect)?$/);
      if(method==='POST'&&mcpMatch?.[2]){
        send(response,200,{server:await mcp.connect(mcpMatch[1])});return;
      }
      if(method==='DELETE'&&mcpMatch&&!mcpMatch[2]){
        mcp.disconnect(mcpMatch[1]);send(response,200,{disconnected:true});return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/health") {
        send(response, 200, { status: "ok", service: "forgeweb-control-plane", generation: workflow.generationStatus(), time: new Date().toISOString() });
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/projects") {
        send(response, 200, { projects: workflow.listProjects() });
        return;
      }
      if (method === "POST" && requestUrl.pathname === "/api/builds") {
        const payload = await body(request) as { prompt?: unknown };
        const build = await workflow.create(payload.prompt,mcp.selectedReferences());
        send(response, 202, { build });
        return;
      }
      const buildEventsMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/events$/);
      if (method === "GET" && buildEventsMatch) {
        streamBuildEvents(request, response, workflow, decodeURIComponent(buildEventsMatch[1]));
        return;
      }
      const stitchZipMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/stitch-zip$/);
      if (method === "POST" && stitchZipMatch) {
        if (request.headers['content-type']?.split(';')[0].trim() !== 'application/zip') throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the Stitch export as application/zip.");
        workflow.get(decodeURIComponent(stitchZipMatch[1]));
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_STITCH_ZIP) throw new ApiError(413, "BODY_TOO_LARGE", "Stitch ZIP exceeds 8 MiB.");
          chunks.push(buffer);
        }
        send(response, 200, { build: await workflow.importStitchDesignZip(decodeURIComponent(stitchZipMatch[1]), Buffer.concat(chunks)) });
        return;
      }
      const buildConfirmationMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/confirm$/);
      if (method === "POST" && buildConfirmationMatch) {
        const build = await workflow.confirm(decodeURIComponent(buildConfirmationMatch[1]));
        send(response, 202, { build });
        return;
      }
      const retryMatch=requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/retry$/);
      const partialMatch=requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/partial-preview(?:\/([^/]+)\/(.+))?$/);
      if(partialMatch){
        const buildId=decodeURIComponent(partialMatch[1]);workflow.get(buildId);
        if(method==='POST'&&!partialMatch[2]){send(response,200,await runtime.compilePartial(buildId,workflow.partialFrontend(buildId)));return;}
        if(method==='GET'&&partialMatch[2]&&partialMatch[3]){
          const path=decodeURIComponent(partialMatch[3]),content=await runtime.partialAsset(buildId,decodeURIComponent(partialMatch[2]),path);
          const extension=path.split('.').at(-1)??'';
          const mime:Record<string,string>={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',woff:'font/woff',woff2:'font/woff2'};
          response.writeHead(200,{'content-type':mime[extension]??'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*','content-security-policy':"sandbox allow-scripts; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: https:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"});response.end(content);return;
        }
      }
      const checkpointMatch=requestUrl.pathname.match(/^\/api\/builds\/([^/]+)\/checkpoints$/);
      if(method==='GET'&&checkpointMatch){
        send(response,200,await workflow.checkpoints(decodeURIComponent(checkpointMatch[1])));
        return;
      }
      if(method==='POST'&&retryMatch){
        send(response,202,{build:await workflow.retry(decodeURIComponent(retryMatch[1]))});
        return;
      }
      const workspaceMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/workspace$/);
      if (method === "GET" && workspaceMatch) {
        send(response, 200, { workspace: await workflow.workspace.getReady(decodeURIComponent(workspaceMatch[1])) });
        return;
      }
      const previewMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/preview$/);
      if (method === "GET" && previewMatch) {
        const preview = await workflow.workspace.getPreview(decodeURIComponent(previewMatch[1]));
        sendPreview(response, preview.html, preview.versionId);
        return;
      }
      const editMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/edits$/);
      if (method === "POST" && editMatch) {
        const payload = await body(request) as { prompt?: unknown };
        const result = await workflow.workspace.edit(decodeURIComponent(editMatch[1]), payload.prompt);
        send(response, 201, result);
        return;
      }
      const restoreMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/);
      if (method === "POST" && restoreMatch) {
        const workspace = await workflow.workspace.restore(decodeURIComponent(restoreMatch[1]), decodeURIComponent(restoreMatch[2]));
        send(response, 200, { workspace });
        return;
      }
      const exportValidationMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/export\/validate$/);
      if (method === "POST" && exportValidationMatch) {
        const summary = await workflow.workspace.validateExport(decodeURIComponent(exportValidationMatch[1]));
        send(response, summary.validation === "passed" ? 200 : 422, { summary });
        return;
      }
      const exportMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
      if (method === "POST" && exportMatch) {
        const result = await workflow.workspace.export(decodeURIComponent(exportMatch[1]));
        sendArchive(response, result.archive, result.filename);
        return;
      }
      const buildMatch = requestUrl.pathname.match(/^\/api\/builds\/([^/]+)$/);
      if (method === "GET" && buildMatch) {
        send(response, 200, { build: workflow.get(decodeURIComponent(buildMatch[1])) });
        return;
      }
      const projectMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (method === "DELETE" && projectMatch) {
        await runtime.stop(decodeURIComponent(projectMatch[1]));
        const deleted = await workflow.deleteProject(decodeURIComponent(projectMatch[1]));
        send(response, 200, { deleted });
        return;
      }
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

export function createForgeWebServer(workflow: BuildWorkflow, mcp?: McpConnections,runtime?:ProjectRuntime): Server {
  const handler = createForgeWebRequestHandler(workflow,mcp,runtime);
  return createServer((request, response) => {
    void handler(request, response);
  });
}
