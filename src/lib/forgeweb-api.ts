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
  frontend: { framework: string; pages: string[]; components: string[]; motion: string[] };
  backend: { runtime: string; modules: string[]; apiStyle: string; jobs: string[] };
  data: { database: string; entities: string[]; rules: string[] };
  security: string[];
  delivery: string[];
  diagram: string;
  markdown: string;
  capabilities: BuildCapability[];
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
    productName: string;
    summary: string;
    roles: string[];
    entities: string[];
    assumptions: string[];
    requirements: Array<{ id: string; title: string; description: string; acceptanceCriteria: string[]; priority: string }>;
    architecture: ArchitecturePlan;
  };
  filePaths: string[];
  validationChecks: Array<{ id: string; name: string; status: "passed" | "failed"; evidence: string }>;
};

type ApiEnvelope = { build: BuildResponse };

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

export async function waitForBuild(
  buildId: string,
  onProgress: (build: BuildResponse) => void,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<BuildResponse> {
  const intervalMs = options.intervalMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const build = await getBuild(buildId);
    onProgress(build);
    if (["awaiting_confirmation", "completed", "failed", "needs_context"].includes(build.status)) return build;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new Error("The build is still running. Check the project activity and try again.");
}
