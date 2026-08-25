import type { GeneratedFile, MasterSpecification, ProductKind, Requirement } from "../domain.ts";
import { GENERATED_AI_TEMPLATE } from "../generated-frontend.ts";
import { ApiError, digest, safePath } from "../lib.ts";
import { FORGEWEB_MASTER_GENERATION_PROMPT, implementationPrompt, planningPrompt } from "../generation/master-prompt.ts";

export type ProviderPlan = {
  productName: string;
  productKind: ProductKind;
  summary: string;
  roles: string[];
  entities: string[];
  requirements: Array<{ title: string; description: string; acceptanceCriteria: string[]; priority: "P0" | "P1" }>;
  frontendPages: string[];
  frontendComponents: string[];
  visualDirection: string;
  backendModules: string[];
  apiRoutes: string[];
  dataRules: string[];
  security: string[];
};

type ProviderManifest = { files: Array<{ path: string; content: string; requirementIds: string[] }> };

export interface ApplicationGenerationProvider {
  readonly id: "google-gemini";
  readonly model: string;
  plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan>;
  generate(specification: MasterSpecification): Promise<GeneratedFile[]>;
}

const stringArray = { type: "array", items: { type: "string" } } as const;
const planSchema = {
  type: "object",
  properties: {
    productName: { type: "string" },
    productKind: { type: "string", enum: ["commerce", "inventory", "scheduler", "portal", "generic"] },
    summary: { type: "string" },
    roles: stringArray,
    entities: stringArray,
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          acceptanceCriteria: stringArray,
          priority: { type: "string", enum: ["P0", "P1"] },
        },
        required: ["title", "description", "acceptanceCriteria", "priority"],
      },
    },
    frontendPages: stringArray,
    frontendComponents: stringArray,
    visualDirection: { type: "string" },
    backendModules: stringArray,
    apiRoutes: stringArray,
    dataRules: stringArray,
    security: stringArray,
  },
  required: ["productName", "productKind", "summary", "roles", "entities", "requirements", "frontendPages", "frontendComponents", "visualDirection", "backendModules", "apiRoutes", "dataRules", "security"],
} as const;

const manifestSchema = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" }, requirementIds: stringArray },
        required: ["path", "content", "requirementIds"],
      },
    },
  },
  required: ["files"],
} as const;

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

export class GeminiGenerationProvider implements ApplicationGenerationProvider {
  readonly id = "google-gemini" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = "gemini-3.7-flash") {
    if (!apiKey.trim()) throw new Error("Gemini API key is required.");
    this.apiKey = apiKey;
    this.model = model;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.request<ProviderPlan>(planningPrompt(prompt, fallback), planSchema, 12_000);
  }

  async generate(specification: MasterSpecification): Promise<GeneratedFile[]> {
    const manifest = await this.request<ProviderManifest>(implementationPrompt(specification), manifestSchema, 48_000);
    return validateProviderManifest(manifest, specification);
  }

  private async request<T>(prompt: string, schema: object, maxOutputTokens: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: FORGEWEB_MASTER_GENERATION_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens,
            responseFormat: { text: { mimeType: "application/json", schema } },
          },
        }),
      });
      if (!response.ok) throw new ApiError(502, "GEMINI_REQUEST_FAILED", `Gemini generation failed with status ${response.status}.`);
      const payload = await response.json() as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (!text) throw new ApiError(502, "GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiError(502, "GEMINI_INVALID_JSON", "Gemini returned invalid structured output.");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === "AbortError") throw new ApiError(504, "GEMINI_TIMEOUT", "Gemini generation exceeded the two-minute limit.");
      throw new ApiError(502, "GEMINI_UNAVAILABLE", "Gemini could not be reached from the ForgeWeb server.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGenerationProviderFromEnv(environment: Record<string, string | undefined> = process.env): ApplicationGenerationProvider | undefined {
  const apiKey = environment.GOOGLE_API_KEY ?? environment.GEMINI_API_KEY;
  if (!apiKey || environment.FORGEWEB_GENERATION_MODE === "deterministic") return undefined;
  return new GeminiGenerationProvider(apiKey, environment.FORGEWEB_GEMINI_MODEL ?? "gemini-3.7-flash");
}

export function applyProviderPlan(fallback: MasterSpecification, plan: ProviderPlan, model: string): MasterSpecification {
  if (plan.requirements.length < 6 || plan.requirements.length > 12) throw new ApiError(422, "GEMINI_PLAN_INVALID", "Gemini must return between 6 and 12 requirements.");
  const requirements: Requirement[] = plan.requirements.map((requirement, index) => ({
    id: `REQ-${String(index + 1).padStart(3, "0")}`,
    title: requirement.title.trim().slice(0, 90),
    description: requirement.description.trim().slice(0, 600),
    acceptanceCriteria: requirement.acceptanceCriteria.map((criterion) => criterion.trim().slice(0, 500)).filter(Boolean).slice(0, 6),
    priority: requirement.priority,
  }));
  const diagram = [
    "flowchart LR",
    "  UI[Responsive React application] --> API[Typed Node API]",
    `  API --> Modules[${plan.backendModules.slice(0, 4).join(" / ")}]`,
    "  Modules --> Data[(Application data)]",
    "  API --> Auth[Authentication and authorization]",
    "  Tests[Acceptance checks] --> UI",
    "  Tests --> API",
  ].join("\n");
  const markdown = [
    `# ${plan.productName} Architecture`, "", plan.summary, "", "## Experience", "", `- Visual direction: ${plan.visualDirection}`,
    ...plan.frontendPages.map((page) => `- ${page}`), "", "## Backend modules", "", ...plan.backendModules.map((module) => `- ${module}`),
    "", "## API routes", "", ...plan.apiRoutes.map((route) => `- ${route}`), "", "## Data rules", "", ...plan.dataRules.map((rule) => `- ${rule}`),
    "", "## Security", "", ...plan.security.map((control) => `- ${control}`), "", "## Diagram", "", "```mermaid", diagram, "```", "",
    "## Generation gate", "", "No source is generated until this architecture and its requirements are explicitly confirmed.", "",
  ].join("\n");
  return {
    ...fallback,
    productName: plan.productName.trim().slice(0, 60),
    productKind: plan.productKind,
    summary: plan.summary.trim().slice(0, 800),
    roles: unique(plan.roles, 10),
    entities: unique(plan.entities, 18),
    requirements,
    architecture: {
      ...fallback.architecture,
      systemShape: `Prompt-specific full-stack application with ${plan.frontendPages.length} customer surfaces, ${plan.backendModules.length} backend modules, and explicit data and security boundaries.`,
      frontend: { ...fallback.architecture.frontend, pages: unique(plan.frontendPages, 12), components: unique(plan.frontendComponents, 20), visualDirection: plan.visualDirection.trim().slice(0, 1_000) },
      backend: { ...fallback.architecture.backend, modules: unique(plan.backendModules, 20), routes: unique(plan.apiRoutes, 24) },
      data: { ...fallback.architecture.data, entities: unique(plan.entities, 18), rules: unique(plan.dataRules, 16) },
      security: unique(plan.security, 16),
      diagram,
      markdown,
    },
    generator: { mode: "gemini", provider: "google-gemini", model, message: "Architecture generated from the customer prompt with Gemini structured output." },
  };
}

function validateProviderManifest(manifest: ProviderManifest, specification: MasterSpecification): GeneratedFile[] {
  if (!Array.isArray(manifest.files) || manifest.files.length < 15 || manifest.files.length > 28) throw new ApiError(422, "GEMINI_MANIFEST_INVALID", "Gemini must return 15-28 modular files.");
  const requirementIds = new Set(specification.requirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  let totalSize = 0;
  const files = manifest.files.map((candidate) => {
    const path = safePath(candidate.path);
    if (seen.has(path)) throw new ApiError(422, "GEMINI_DUPLICATE_PATH", `Gemini returned duplicate path ${path}.`);
    if (/^(?:\.env|\.git|node_modules)(?:\/|$)/i.test(path)) throw new ApiError(422, "GEMINI_FORBIDDEN_PATH", `Gemini returned forbidden path ${path}.`);
    if (typeof candidate.content !== "string" || candidate.content.length < 2 || candidate.content.length > 180_000) throw new ApiError(422, "GEMINI_FILE_INVALID", `Gemini returned invalid content for ${path}.`);
    if (/AIza[0-9A-Za-z_-]{25,}/.test(candidate.content)) throw new ApiError(422, "GEMINI_SECRET_DETECTED", `Generated file ${path} appears to contain a Google API key.`);
    const traced = unique(candidate.requirementIds.filter((item) => requirementIds.has(item)), requirementIds.size);
    if (traced.length === 0) throw new ApiError(422, "GEMINI_TRACEABILITY_MISSING", `Generated file ${path} has no approved requirement IDs.`);
    totalSize += candidate.content.length;
    seen.add(path);
    const content = path === "frontend/preview.html" && !candidate.content.includes(GENERATED_AI_TEMPLATE)
      ? candidate.content.replace(/<!doctype html>/i, `<!doctype html>\n<!-- ${GENERATED_AI_TEMPLATE} -->`)
      : path === "frontend/src/App.tsx" && !candidate.content.includes(GENERATED_AI_TEMPLATE)
        ? `// ${GENERATED_AI_TEMPLATE}\n${candidate.content}`
        : candidate.content;
    return { path, content, requirementIds: traced, digest: digest(content) };
  });
  if (totalSize > 1_500_000) throw new ApiError(422, "GEMINI_MANIFEST_TOO_LARGE", "Gemini manifest exceeds the 1.5 MB safety limit.");
  const required = ["README.md", "ARCHITECTURE.md", "package.json", "frontend/src/App.tsx", "frontend/src/main.tsx", "frontend/src/styles.css", "frontend/preview.html", "backend/src/index.ts", "backend/src/api/contracts.ts", "backend/src/security/access-control.ts", "tests/acceptance.test.ts"];
  for (const path of required) if (!seen.has(path)) throw new ApiError(422, "GEMINI_REQUIRED_FILE_MISSING", `Gemini manifest is missing ${path}.`);
  if (files.filter((file) => file.path.startsWith("frontend/src/")).length < 5) throw new ApiError(422, "GEMINI_FRONTEND_MONOLITH", "Gemini frontend must contain at least five source modules.");
  if (files.filter((file) => file.path.startsWith("backend/src/")).length < 4) throw new ApiError(422, "GEMINI_BACKEND_MONOLITH", "Gemini backend must contain at least four source modules.");
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  let packageManifest: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    packageManifest = JSON.parse(byPath.get("package.json") ?? "") as typeof packageManifest;
  } catch {
    throw new ApiError(422, "GEMINI_PACKAGE_INVALID", "Generated package.json is not valid JSON.");
  }
  for (const script of ["dev", "build", "test"]) if (!packageManifest.scripts?.[script]) throw new ApiError(422, "GEMINI_PACKAGE_SCRIPT_MISSING", `Generated package.json is missing the ${script} script.`);
  if (!(packageManifest.dependencies?.react || packageManifest.devDependencies?.react)) throw new ApiError(422, "GEMINI_REACT_MISSING", "Generated package.json does not include React.");
  const preview = byPath.get("frontend/preview.html") ?? "";
  if (!/^<!doctype html>/i.test(preview) || !/<header[\s>]/i.test(preview) || !/<main[\s>]/i.test(preview) || !/<\/html>/i.test(preview)) throw new ApiError(422, "GEMINI_PREVIEW_INVALID", "Generated preview must be a complete semantic HTML document.");
  if (!/export\s+default\s+function|export\s+default\s+[A-Z]/.test(byPath.get("frontend/src/App.tsx") ?? "")) throw new ApiError(422, "GEMINI_APP_INVALID", "Generated App.tsx must export the application component.");
  if (!/createServer|\.listen\s*\(|express\s*\(|fastify\s*\(/.test(byPath.get("backend/src/index.ts") ?? "")) throw new ApiError(422, "GEMINI_SERVER_INVALID", "Generated backend entry must construct or start an HTTP server.");
  if (!/authorize|access|role|permission/i.test(byPath.get("backend/src/security/access-control.ts") ?? "")) throw new ApiError(422, "GEMINI_ACCESS_CONTROL_INVALID", "Generated access-control module does not contain an authorization boundary.");
  return files;
}

function unique(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}
