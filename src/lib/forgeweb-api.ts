export type BuildStatus = "queued" | "specifying" | "planning" | "awaiting_confirmation" | "generating" | "reviewing" | "validating" | "completed" | "failed" | "needs_context";

export type BuildCapability = {
  id: string;
  name: string;
  kind: string;
  sourceUrl: string;
  usage: string;
  boundary: string;
};

export type ArchitecturePlan = {
  systemShape: string;
  frontend: { framework: string; pages: string[]; components: string[]; motion: string[]; visualDirection?: string };
  backend: { runtime: string; modules: string[]; apiStyle: string; jobs: string[]; routes?: string[] };
  data: { database: string; entities: string[]; rules: string[] };
  security: string[];
  delivery: string[];
  diagram: string;
  markdown: string;
  capabilities: BuildCapability[];
};

export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  status: "planning" | "awaiting_confirmation" | "building" | "editing" | "ready" | "validation_failed" | "ready_to_export" | "failed";
  originalPrompt?: string;
  currentBuildId?: string;
  currentVersionId?: string;
  currentVersionNumber?: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredFile = { path: string; content: string; requirementIds: string[]; digest: string };

export type ProjectVersion = {
  id: string;
  projectId: string;
  buildId: string;
  versionNumber: number;
  label: string;
  editPrompt: string;
  modifiedFiles: string[];
  sourceVersionId?: string;
  validationStatus: "pending" | "passed" | "failed";
  validationChecks: Array<{ id: string; name: string; status: "passed" | "failed"; evidence: string }>;
  createdAt: string;
};

export type ProjectWorkspace = {
  editingMode?:'ai'|'local-style';
  graphify?: {status:'ready'|'warning';message:string;nodes?:number;edges?:number;sourceHash:string};
  project: ProjectSummary;
  currentVersion?: ProjectVersion;
  versions: ProjectVersion[];
  files: StoredFile[];
  database: {
    engine: string;
    schemaSource: string;
    tables: Array<{ name: string; purpose: string }>;
    separationNote: string;
  };
};

export type ExportSummary = {
  projectId: string;
  projectName: string;
  versionId: string;
  versionNumber: number;
  frontend: "generated" | "missing";
  backend: "generated" | "missing";
  database: "configured" | "not-required";
  validation: "passed" | "failed";
  fileCount: number;
  checks: Array<{ id: string; name: string; status: "passed" | "failed"; evidence: string }>;
};

export type BuildResponse = {
  id: string;
  projectId: string;
  status: BuildStatus;
  currentStageIndex: number;
  stageDetail: string;
  error?: { code: string; message: string };
  specification?: {
    id: string;
    status: "proposed" | "approved";
    productKind: "commerce" | "restaurant" | "inventory" | "scheduler" | "portal" | "generic";
    productName: string;
    summary: string;
    roles: string[];
    entities: string[];
    assumptions: string[];
    requirements: Array<{ id: string; title: string; description: string; acceptanceCriteria: string[]; priority: string }>;
    architecture: ArchitecturePlan;
    generator?: { mode: "ai" | "gemini" | "deterministic"; provider: "gemini-python" | "groq-openrouter" | "openrouter" | "groq" | "google-gemini" | "forgeweb-local"; model: string; message: string };
  };
  filePaths: string[];
  validationChecks: Array<{ id: string; name: string; status: "passed" | "failed"; evidence: string }>;
  project: ProjectSummary;
};

type ApiEnvelope = { build: BuildResponse };

export type RuntimeStatus={status:'stopped'|'starting'|'running'|'failed';hasSession?:boolean;cleanupPending?:boolean;versionId?:string;validationStatus?:string;eligible?:boolean;url?:string;frontendHealthy:boolean;backendHealthy:boolean;message:string};
export type StorageView={engine:string;location:string;note?:string;message?:string;tables?:Array<{name:string;count:number}>;collections?:Array<{name:string;count:number}>;rows?:unknown[];total?:number};
export async function getRuntime(projectId:string){return (await request<{runtime:RuntimeStatus}>(`/api/projects/${encodeURIComponent(projectId)}/runtime`)).runtime;}
export async function runtimeAction(projectId:string,action:'start'|'stop'|'refresh',versionId?:string){
  if(action==='refresh')return getRuntime(projectId);
  return (await request<{runtime:RuntimeStatus}>(`/api/projects/${encodeURIComponent(projectId)}/runtime`,{method:action==='start'?'POST':'DELETE',...(action==='start'?{body:JSON.stringify({versionId})}:{})})).runtime;
}
export async function validateRuntimeVersion(projectId:string,versionId:string){return (await request<{workspace:ProjectWorkspace}>(`/api/projects/${encodeURIComponent(projectId)}/runtime/validate`,{method:'POST',body:JSON.stringify({versionId})})).workspace;}
export async function readStorage(projectId?:string,collection='',offset=0){return (await request<{storage:StorageView}>(projectId?`/api/projects/${encodeURIComponent(projectId)}/storage?collection=${encodeURIComponent(collection)}&offset=${offset}`:'/api/storage')).storage;}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed with status ${response.status}.`);
  return payload;
}

export async function createBuild(prompt: string): Promise<BuildResponse> {
  const payload = await request<ApiEnvelope>("/api/builds", { method: "POST", body: JSON.stringify({ prompt }) });
  return payload.build;
}

export async function confirmBuild(buildId: string): Promise<BuildResponse> {
  const payload = await request<ApiEnvelope>(`/api/builds/${encodeURIComponent(buildId)}/confirm`, { method: "POST" });
  return payload.build;
}

export async function getBuild(buildId: string): Promise<BuildResponse> {
  const payload = await request<ApiEnvelope>(`/api/builds/${encodeURIComponent(buildId)}`);
  return payload.build;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const payload = await request<{ projects: ProjectSummary[] }>("/api/projects");
  return payload.projects;
}

export type McpServer={id:string;name:string;status:'not_connected'|'verified';checkedAt?:string;tools:Array<{name:string}>;kind:'stitch'|'supabase'|'custom';reference?:{data:string};selected?:boolean};
export async function listMcpServers():Promise<McpServer[]>{
  return (await request<{servers:McpServer[]}>('/api/mcp')).servers;
}
export async function inspectMcpServer(id:string):Promise<McpServer>{
  return (await request<{server:McpServer}>(`/api/mcp/${encodeURIComponent(id)}/connect`,{method:'POST'})).server;
}
export async function disconnectMcpServer(id:string):Promise<void>{
  await request(`/api/mcp/${encodeURIComponent(id)}`,{method:'DELETE'});
}
export async function readMcpReference(id:string,selection:{projectId?:string;screenId?:string}):Promise<McpServer>{
  return (await request<{server:McpServer}>(`/api/mcp/${encodeURIComponent(id)}/read`,{method:'POST',body:JSON.stringify(selection)})).server;
}
export async function selectMcpReference(id:string,enabled:boolean):Promise<McpServer[]>{
  return (await request<{servers:McpServer[]}>(`/api/mcp/${encodeURIComponent(id)}/select`,{method:'POST',body:JSON.stringify({enabled})})).servers;
}

export async function deleteProject(projectId: string): Promise<{ id: string; name: string }> {
  const payload = await request<{ deleted: { id: string; name: string } }>(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  return payload.deleted;
}

export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
  const payload = await request<{ workspace: ProjectWorkspace }>(`/api/projects/${encodeURIComponent(projectId)}/workspace`);
  return payload.workspace;
}

export async function applyProjectEdit(projectId: string, prompt: string): Promise<{ workspace: ProjectWorkspace; modifiedFiles: string[]; phases: string[] }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/edits`, { method: "POST", body: JSON.stringify({ prompt }) });
}

export async function restoreProjectVersion(projectId: string, versionId: string): Promise<ProjectWorkspace> {
  const payload = await request<{ workspace: ProjectWorkspace }>(`/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST" });
  return payload.workspace;
}

export async function validateProjectExport(projectId: string): Promise<ExportSummary> {
  const payload = await request<{ summary: ExportSummary }>(`/api/projects/${encodeURIComponent(projectId)}/export/validate`, { method: "POST" });
  return payload.summary;
}

export async function downloadProjectZip(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export`, { method: "POST" });
  if (!response.ok) {
    const payload = await response.json() as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? "Project export failed.");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "forgeweb-project.zip";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function waitForBuild(
  buildId: string,
  onProgress: (build: BuildResponse) => void,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<BuildResponse> {
  const intervalMs = options.intervalMs ?? 1_000;
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const build = await getBuild(buildId);
    onProgress(build);
    if (["awaiting_confirmation", "completed", "failed", "needs_context"].includes(build.status)) return build;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new BuildWaitTimeoutError("Monitoring timed out; the server has not reported a terminal result. Check project activity before starting another build.");
}

export class BuildWaitTimeoutError extends Error {}

export async function uploadStitchZip(buildId: string, file: File): Promise<BuildResponse> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Stitch ZIP must be smaller than 8 MiB.");
  const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/stitch-zip`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
  const payload = await response.json() as { build?: BuildResponse; error?: { message?: string } };
  if (!response.ok || !payload.build) throw new Error(payload.error?.message ?? "Stitch ZIP import failed.");
  return payload.build;
}
