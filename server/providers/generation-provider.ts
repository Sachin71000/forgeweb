import type { GeneratedFile, MasterSpecification, ProductKind, Requirement } from "../domain.ts";
import { GENERATED_AI_TEMPLATE } from "../generated-frontend.ts";
import { ApiError, digest, safePath } from "../lib.ts";
import { backendImplementationPrompt, FORGEWEB_MASTER_GENERATION_PROMPT, frontendImplementationPrompt, planningPrompt } from "../generation/master-prompt.ts";

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
  designFingerprint: string;
  navigationPattern: string;
  interactionMap: string[];
  backendModules: string[];
  apiRoutes: string[];
  dataRules: string[];
  security: string[];
};

type ProviderManifest = { files: Array<{ path: string; content: string; requirementIds: string[] }> };
type EncodedBackendBundle = { mainPy: string; routesPy: string; domainPy: string; contractsPy: string; servicePy: string; requirementIds: string[] };

export interface ApplicationGenerationProvider {
  readonly id: "gemini-python" | "groq-openrouter" | "openrouter" | "groq" | "google-gemini";
  readonly mode: "ai" | "gemini";
  readonly model: string;
  plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan>;
  generate(specification: MasterSpecification): Promise<GeneratedFile[]>;
}

const stringArray = { type: "array", items: { type: "string" } } as const;
const planSchema = {
  type: "object",
  properties: {
    productName: { type: "string" },
    productKind: { type: "string", enum: ["commerce", "restaurant", "inventory", "scheduler", "portal", "generic"] },
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
        additionalProperties: false,
      },
    },
    frontendPages: stringArray,
    frontendComponents: stringArray,
    visualDirection: { type: "string" },
    designFingerprint: { type: "string" },
    navigationPattern: { type: "string" },
    interactionMap: stringArray,
    backendModules: stringArray,
    apiRoutes: stringArray,
    dataRules: stringArray,
    security: stringArray,
  },
  required: ["productName", "productKind", "summary", "roles", "entities", "requirements", "frontendPages", "frontendComponents", "visualDirection", "designFingerprint", "navigationPattern", "interactionMap", "backendModules", "apiRoutes", "dataRules", "security"],
  additionalProperties: false,
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
        additionalProperties: false,
      },
    },
  },
  required: ["files"],
  additionalProperties: false,
} as const;
const encodedBackendSchema = {
  type: "object",
  properties: {
    mainPy: { type: "string" },
    routesPy: { type: "string" },
    domainPy: { type: "string" },
    contractsPy: { type: "string" },
    servicePy: { type: "string" },
    requirementIds: stringArray,
  },
  required: ["mainPy", "routesPy", "domainPy", "contractsPy", "servicePy", "requirementIds"],
  additionalProperties: false,
} as const;

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
type ChatCompletionResponse = { choices?: Array<{ message?: { content?: string | null } }> };

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, init);
    // Quota exhaustion is not repaired by rapid retries. Return 429 immediately so
    // the provider chain can switch models instead of blocking the customer build.
    if (![404, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
  return response!;
}

export class GeminiGenerationProvider implements ApplicationGenerationProvider {
  readonly id = "google-gemini" as const;
  readonly mode = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = "gemini-3-flash-preview") {
    if (!apiKey.trim()) throw new Error("Gemini API key is required.");
    this.apiKey = apiKey;
    this.model = model;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.request<ProviderPlan>(planningPrompt(prompt, fallback), planSchema, 4_500);
  }

  async generate(specification: MasterSpecification): Promise<GeneratedFile[]> {
    const manifest = await this.generateFrontendManifest(specification);
    return validateProviderManifest(manifest, specification);
  }

  async generateFrontendManifest(specification: MasterSpecification): Promise<ProviderManifest> {
    return this.request<ProviderManifest>(frontendImplementationPrompt(specification), manifestSchema, 8_000);
  }

  private async request<T>(prompt: string, schema: object, maxOutputTokens: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: FORGEWEB_MASTER_GENERATION_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
          },
        }),
      });
      if (!response.ok) {
        const raw = await response.text();
        let detail = "";
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
          const message = parsed.error?.message ?? "";
          const quota = message.match(/Quota exceeded[^\n]*/i)?.[0] ?? message.match(/exceeded your current quota[^.]*\.?/i)?.[0] ?? "";
          detail = [parsed.error?.status, quota].filter(Boolean).join(": ").slice(0, 280);
        } catch {
          detail = raw.replace(/\s+/g, " ").slice(0, 180);
        }
        throw new ApiError(502, "GEMINI_REQUEST_FAILED", `Gemini generation failed with status ${response.status}${detail ? ` (${detail})` : ""}.`);
      }
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

type CompatibleProviderId = "openrouter" | "groq";

class OpenAiCompatibleGenerationProvider implements ApplicationGenerationProvider {
  readonly mode = "ai" as const;
  readonly id: CompatibleProviderId;
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(
    id: CompatibleProviderId,
    apiKey: string,
    model: string,
    endpoint: string,
  ) {
    if (!apiKey.trim()) throw new Error(`${id} API key is required.`);
    this.id = id;
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.request<ProviderPlan>(planningPrompt(prompt, fallback), planSchema, "forgeweb_architecture", 4_500);
  }

  async generate(specification: MasterSpecification): Promise<GeneratedFile[]> {
    const frontend = await this.generateFrontendManifest(specification);
    const backend = await this.generateBackendManifest(specification);
    return composeProviderApplication(frontend, backend, specification);
  }

  async generateFrontendManifest(specification: MasterSpecification): Promise<ProviderManifest> {
    const prompt = frontendImplementationPrompt(specification);
    try {
      return await this.request<ProviderManifest>(prompt, manifestSchema, "forgeweb_react_frontend", 5_200);
    } catch (error) {
      const message = providerErrorMessage(error);
      if (this.id !== "groq" || !/status 400|json_validate_failed|Failed to generate JSON/i.test(message)) throw error;
      return this.request<ProviderManifest>(prompt, manifestSchema, "forgeweb_react_frontend", 4_800, "json_object");
    }
  }

  async generateBackendManifest(specification: MasterSpecification): Promise<ProviderManifest> {
    const encoded = await this.request<EncodedBackendBundle>(backendImplementationPrompt(specification), encodedBackendSchema, "forgeweb_python_backend", 3_500);
    const paths: Array<[string, keyof EncodedBackendBundle]> = [
      ["backend/app/main.py", "mainPy"],
      ["backend/app/api/routes.py", "routesPy"],
      ["backend/app/models/domain.py", "domainPy"],
      ["backend/app/schemas/contracts.py", "contractsPy"],
      ["backend/app/services/application_service.py", "servicePy"],
    ];
    return {
      files: paths.map(([path, field]) => ({
        path,
        content: Buffer.from(encoded[field] as string, "base64").toString("utf8"),
        requirementIds: encoded.requirementIds,
      })),
    };
  }

  private async request<T>(prompt: string, schema: object, schemaName: string, maxOutputTokens: number, responseMode: "json_schema" | "json_object" = "json_schema"): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetchWithRetry(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(this.id === "openrouter" ? { "http-referer": "https://github.com/Sachin71000/forgeweb", "x-openrouter-title": "ForgeWeb" } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: FORGEWEB_MASTER_GENERATION_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.28,
          max_tokens: maxOutputTokens,
          ...(this.id === "groq" && /gpt-oss/i.test(this.model) ? { reasoning_effort: "low" } : {}),
          response_format: responseMode === "json_object"
            ? { type: "json_object" }
            : { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
        }),
      });
      if (!response.ok) {
        const rawDetail = (await response.text()).replace(/\s+/g, " ");
        const detail = rawDetail.includes('"failed_generation"')
          ? rawDetail.slice(0, rawDetail.indexOf('"failed_generation"')).slice(0, 240)
          : rawDetail.slice(0, 240);
        throw new ApiError(502, "MODEL_REQUEST_FAILED", `${this.id} generation failed with status ${response.status}${detail ? `: ${detail}` : "."}`);
      }
      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new ApiError(502, "MODEL_EMPTY_RESPONSE", `${this.id} returned no structured output.`);
      try {
        return JSON.parse(content) as T;
      } catch {
        throw new ApiError(502, "MODEL_INVALID_JSON", `${this.id} returned invalid structured output.`);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === "AbortError") throw new ApiError(504, "MODEL_TIMEOUT", `${this.id} generation exceeded the three-minute limit.`);
      throw new ApiError(502, "MODEL_UNAVAILABLE", `${this.id} could not be reached from the ForgeWeb server.`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

class GroqOpenRouterGenerationProvider implements ApplicationGenerationProvider {
  readonly id = "groq-openrouter" as const;
  readonly mode = "ai" as const;
  readonly model: string;
  private readonly planner: OpenAiCompatibleGenerationProvider;
  private readonly implementer: OpenAiCompatibleGenerationProvider;

  constructor(
    planner: OpenAiCompatibleGenerationProvider,
    implementer: OpenAiCompatibleGenerationProvider,
  ) {
    this.planner = planner;
    this.implementer = implementer;
    this.model = `${planner.model} → ${implementer.model}`;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    try {
      return await this.planner.plan(prompt, fallback);
    } catch (primaryError) {
      try {
        return await this.implementer.plan(prompt, fallback);
      } catch (fallbackError) {
        throw combinedProviderError("planning", primaryError, fallbackError);
      }
    }
  }

  async generate(specification: MasterSpecification): Promise<GeneratedFile[]> {
    try {
      return await this.implementer.generate(specification);
    } catch (primaryError) {
      try {
        return await this.planner.generate(specification);
      } catch (fallbackError) {
        throw combinedProviderError("generation", primaryError, fallbackError);
      }
    }
  }
}

class GeminiPythonGenerationProvider implements ApplicationGenerationProvider {
  readonly id = "gemini-python" as const;
  readonly mode = "ai" as const;
  readonly model: string;
  private readonly gemini: GeminiGenerationProvider;
  private readonly backendPrimary: OpenAiCompatibleGenerationProvider;
  private readonly backendFallback?: OpenAiCompatibleGenerationProvider;

  constructor(
    gemini: GeminiGenerationProvider,
    backendPrimary: OpenAiCompatibleGenerationProvider,
    backendFallback?: OpenAiCompatibleGenerationProvider,
  ) {
    this.gemini = gemini;
    this.backendPrimary = backendPrimary;
    this.backendFallback = backendFallback;
    this.model = `${gemini.model} → ${backendPrimary.model}${backendFallback ? ` / ${backendFallback.model}` : ""}`;
  }

  plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.planWithFallback(prompt, fallback);
  }

  private async planWithFallback(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    try {
      return await this.gemini.plan(prompt, fallback);
    } catch (geminiError) {
      try {
        return await this.backendPrimary.plan(prompt, fallback);
      } catch (primaryError) {
        if (!this.backendFallback) throw combinedProviderError("architecture planning", geminiError, primaryError);
        try {
          return await this.backendFallback.plan(prompt, fallback);
        } catch (fallbackError) {
          throw new ApiError(502, "PROVIDER_CHAIN_FAILED", `Architecture planning failed. Gemini: ${providerErrorMessage(geminiError)} Primary fallback: ${providerErrorMessage(primaryError)} Secondary fallback: ${providerErrorMessage(fallbackError)}`);
        }
      }
    }
  }

  async generate(specification: MasterSpecification): Promise<GeneratedFile[]> {
    let frontendManifest: ProviderManifest;
    try {
      frontendManifest = await this.gemini.generateFrontendManifest(specification);
    } catch (geminiError) {
      try {
        frontendManifest = await this.backendPrimary.generateFrontendManifest(specification);
      } catch (primaryError) {
        if (!this.backendFallback) throw combinedProviderError("React frontend generation", geminiError, primaryError);
        try {
          frontendManifest = await this.backendFallback.generateFrontendManifest(specification);
        } catch (fallbackError) {
          throw new ApiError(502, "PROVIDER_CHAIN_FAILED", `React frontend generation failed. Gemini: ${providerErrorMessage(geminiError)} Primary fallback: ${providerErrorMessage(primaryError)} Secondary fallback: ${providerErrorMessage(fallbackError)}`);
        }
      }
    }
    let backendManifest: ProviderManifest;
    try {
      backendManifest = await this.backendPrimary.generateBackendManifest(specification);
    } catch (primaryError) {
      if (!this.backendFallback) throw primaryError;
      try {
        backendManifest = await this.backendFallback.generateBackendManifest(specification);
      } catch (fallbackError) {
        throw combinedProviderError("Python backend generation", primaryError, fallbackError);
      }
    }
    return composeProviderApplication(frontendManifest, backendManifest, specification);
  }
}

function composeProviderApplication(frontendManifest: ProviderManifest, backendManifest: ProviderManifest, specification: MasterSpecification): GeneratedFile[] {
  const requirements = specification.requirements.map((requirement) => requirement.id);
  const contract = createApiContract(specification);
  return validateProviderManifest({ files: [
    ...frontendManifest.files,
    ...backendManifest.files,
    ...createFrontendSupportFiles(specification),
    ...createBackendSupportFiles(specification),
    { path: "README.md", content: `# ${specification.productName}\n\n${specification.summary}\n\nThe React frontend and FastAPI backend share the contract in \`shared/api-contract.json\`.\n`, requirementIds: requirements },
    { path: "REQUIREMENTS.md", content: requirementsMarkdown(specification), requirementIds: requirements },
    { path: "ARCHITECTURE.md", content: specification.architecture.markdown, requirementIds: requirements },
    { path: "shared/api-contract.json", content: `${JSON.stringify(contract, null, 2)}\n`, requirementIds: requirements },
  ] }, specification);
}

function combinedProviderError(stage: string, primaryError: unknown, fallbackError: unknown): ApiError {
  return new ApiError(502, "PROVIDER_CHAIN_FAILED", `${stage} failed. Primary: ${providerErrorMessage(primaryError)} Fallback: ${providerErrorMessage(fallbackError)}`);
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error";
}

export function createGenerationProviderFromEnv(environment: Record<string, string | undefined> = process.env): ApplicationGenerationProvider | undefined {
  const requestedMode = environment.FORGEWEB_GENERATION_MODE?.toLowerCase() ?? "auto";
  if (requestedMode === "deterministic") return undefined;
  const openRouterKey = environment.OPENROUTER_API_KEY;
  const groqKey = environment.GROQ_API_KEY;
  const geminiKey = environment.GOOGLE_API_KEY ?? environment.GEMINI_API_KEY;
  const openRouter = openRouterKey ? new OpenAiCompatibleGenerationProvider("openrouter", openRouterKey, environment.FORGEWEB_OPENROUTER_MODEL ?? "openai/gpt-5.3-codex", "https://openrouter.ai/api/v1/chat/completions") : undefined;
  const groq = groqKey ? new OpenAiCompatibleGenerationProvider("groq", groqKey, environment.FORGEWEB_GROQ_MODEL ?? "qwen/qwen3.8-27b", "https://api.groq.com/openai/v1/chat/completions") : undefined;
  const gemini = geminiKey ? new GeminiGenerationProvider(geminiKey, environment.FORGEWEB_GEMINI_MODEL ?? "gemini-3-flash-preview") : undefined;
  if (["auto", "split", "gemini-python"].includes(requestedMode) && gemini && (groq || openRouter)) {
    return new GeminiPythonGenerationProvider(gemini, groq ?? openRouter!, groq && openRouter ? openRouter : undefined);
  }
  if (["auto", "dual"].includes(requestedMode) && groq && openRouter) return new GroqOpenRouterGenerationProvider(groq, openRouter);
  if (["auto", "openrouter"].includes(requestedMode) && openRouter) return openRouter;
  if (["auto", "groq"].includes(requestedMode) && groq) return groq;
  if (["auto", "gemini"].includes(requestedMode) && gemini) return gemini;
  return undefined;
}

export function applyProviderPlan(fallback: MasterSpecification, plan: ProviderPlan, provider: ApplicationGenerationProvider): MasterSpecification {
  const productName = plan.productName.trim().slice(0, 60) || fallback.productName;
  const summary = plan.summary.trim().slice(0, 800) || fallback.summary;
  const roles = unique(plan.roles, 10).length ? unique(plan.roles, 10) : fallback.roles;
  const entities = unique(plan.entities, 18).length ? unique(plan.entities, 18) : fallback.entities;
  const frontendPages = unique(plan.frontendPages, 12).length ? unique(plan.frontendPages, 12) : fallback.architecture.frontend.pages;
  const frontendComponents = unique(plan.frontendComponents, 20).length ? unique(plan.frontendComponents, 20) : fallback.architecture.frontend.components;
  const backendModules = unique(plan.backendModules, 20).length ? unique(plan.backendModules, 20) : fallback.architecture.backend.modules;
  const apiRoutes = unique(plan.apiRoutes, 24).length ? unique(plan.apiRoutes, 24) : (fallback.architecture.backend.routes ?? []);
  const dataRules = unique(plan.dataRules, 16).length ? unique(plan.dataRules, 16) : fallback.architecture.data.rules;
  const security = unique(plan.security, 16).length ? unique(plan.security, 16) : fallback.architecture.security;
  const normalizedPlanRequirements = [...plan.requirements];
  const existingTitles = new Set(normalizedPlanRequirements.map((requirement) => requirement.title.trim().toLocaleLowerCase()));
  for (const fallbackRequirement of fallback.requirements) {
    if (normalizedPlanRequirements.length >= 6) break;
    if (existingTitles.has(fallbackRequirement.title.trim().toLocaleLowerCase())) continue;
    normalizedPlanRequirements.push({
      title: fallbackRequirement.title,
      description: fallbackRequirement.description,
      acceptanceCriteria: fallbackRequirement.acceptanceCriteria,
      priority: fallbackRequirement.priority,
    });
  }
  if (normalizedPlanRequirements.length === 0) throw new ApiError(422, "MODEL_PLAN_INVALID", "The planning model returned no usable requirements.");
  const requirements: Requirement[] = normalizedPlanRequirements.slice(0, 12).map((requirement, index) => ({
    id: `REQ-${String(index + 1).padStart(3, "0")}`,
    title: requirement.title.trim().slice(0, 90),
    description: requirement.description.trim().slice(0, 600),
    acceptanceCriteria: requirement.acceptanceCriteria.map((criterion) => criterion.trim().slice(0, 500)).filter(Boolean).slice(0, 6),
    priority: requirement.priority,
  }));
  const diagram = [
    "flowchart LR",
    "  UI[Responsive React application] --> API[Shared JSON contract]",
    "  API --> FastAPI[Python FastAPI service]",
    `  API --> Modules[${backendModules.slice(0, 4).join(" / ")}]`,
    "  Modules --> Data[(Application data)]",
    "  API --> Auth[Authentication and authorization]",
    "  Tests[Acceptance checks] --> UI",
    "  Tests --> API",
  ].join("\n");
  const visualDirection = [
    plan.visualDirection.trim() || fallback.architecture.frontend.visualDirection || "Prompt-specific responsive product interface",
    `Design fingerprint: ${plan.designFingerprint}`,
    `Navigation pattern: ${plan.navigationPattern}`,
  ].join(" ").trim();
  const markdown = [
    `# ${productName} Architecture`, "", summary, "", "## Experience", "", `- Visual direction: ${plan.visualDirection.trim() || fallback.architecture.frontend.visualDirection || "Prompt-specific responsive product interface"}`,
    `- Design fingerprint: ${plan.designFingerprint}`, `- Navigation pattern: ${plan.navigationPattern}`,
    ...frontendPages.map((page) => `- ${page}`), "", "## Backend modules", "", ...backendModules.map((module) => `- ${module}`),
    "", "## API routes", "", ...apiRoutes.map((route) => `- ${route}`), "", "## Data rules", "", ...dataRules.map((rule) => `- ${rule}`),
    "", "## Interaction contract", "", ...plan.interactionMap.map((interaction) => `- ${interaction}`),
    "", "## Security", "", ...security.map((control) => `- ${control}`), "", "## Diagram", "", "```mermaid", diagram, "```", "",
    "## Generation gate", "", "No source is generated until this architecture and its requirements are explicitly confirmed.", "",
  ].join("\n");
  return {
    ...fallback,
    productName,
    productKind: plan.productKind,
    summary,
    roles,
    entities,
    requirements,
    architecture: {
      ...fallback.architecture,
      systemShape: `Prompt-specific full-stack application with ${frontendPages.length} customer surfaces, ${backendModules.length} backend modules, and explicit data and security boundaries.`,
      frontend: { ...fallback.architecture.frontend, pages: frontendPages, components: frontendComponents, visualDirection: visualDirection.slice(0, 1_500) },
      backend: { ...fallback.architecture.backend, modules: backendModules, routes: apiRoutes },
      data: { ...fallback.architecture.data, entities, rules: dataRules },
      security,
      diagram,
      markdown,
    },
    generator: {
      mode: provider.mode,
      provider: provider.id,
      model: provider.model,
      message: provider.id === "gemini-python"
        ? "Gemini planned the product and generates its React interface; Groq/OpenRouter generates the contract-matched Python FastAPI backend."
        : provider.id === "groq-openrouter"
        ? "Groq planned the product and design; OpenRouter generates the modular application with cross-provider fallback."
        : `Architecture and source are generated from the customer prompt by ${provider.id}.`,
    },
  };
}

function validateProviderManifest(manifest: ProviderManifest, specification: MasterSpecification): GeneratedFile[] {
  if (!Array.isArray(manifest.files) || manifest.files.length < 15 || manifest.files.length > 40) throw new ApiError(422, "MODEL_MANIFEST_INVALID", "The implementation pipeline must return 15-40 modular files.");
  const requirementIds = new Set(specification.requirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  let totalSize = 0;
  const files = manifest.files.map((candidate) => {
    const path = safePath(candidate.path);
    if (seen.has(path)) throw new ApiError(422, "MODEL_DUPLICATE_PATH", `The model returned duplicate path ${path}.`);
    if (/^(?:\.env|\.git|node_modules)(?:\/|$)/i.test(path)) throw new ApiError(422, "MODEL_FORBIDDEN_PATH", `The model returned forbidden path ${path}.`);
    if (typeof candidate.content !== "string" || candidate.content.length < 2 || candidate.content.length > 180_000) throw new ApiError(422, "MODEL_FILE_INVALID", `The model returned invalid content for ${path}.`);
    if (/(?:AIza[0-9A-Za-z_-]{25,}|gsk_[0-9A-Za-z_-]{30,}|sk-or-v1-[0-9A-Za-z_-]{30,})/.test(candidate.content)) throw new ApiError(422, "MODEL_SECRET_DETECTED", `Generated file ${path} appears to contain an API credential.`);
    const traced = unique(candidate.requirementIds.filter((item) => requirementIds.has(item)), requirementIds.size);
    if (traced.length === 0) throw new ApiError(422, "MODEL_TRACEABILITY_MISSING", `Generated file ${path} has no approved requirement IDs.`);
    totalSize += candidate.content.length;
    seen.add(path);
    const content = path === "frontend/preview.html" && !candidate.content.includes(GENERATED_AI_TEMPLATE)
      ? candidate.content.replace(/<!doctype html>/i, `<!doctype html>\n<!-- ${GENERATED_AI_TEMPLATE} -->`)
      : path === "frontend/src/App.tsx" && !candidate.content.includes(GENERATED_AI_TEMPLATE)
        ? `// ${GENERATED_AI_TEMPLATE}\n${candidate.content}`
        : candidate.content;
    return { path, content, requirementIds: traced, digest: digest(content) };
  });
  if (totalSize > 1_500_000) throw new ApiError(422, "MODEL_MANIFEST_TOO_LARGE", "The generated manifest exceeds the 1.5 MB safety limit.");
  const required = ["README.md", "REQUIREMENTS.md", "ARCHITECTURE.md", "INTERACTIONS.md", "shared/api-contract.json", "package.json", "index.html", "tsconfig.json", "frontend/src/App.tsx", "frontend/src/main.tsx", "frontend/src/vite-env.d.ts", "frontend/src/styles.css", "frontend/src/lib/api.ts", "frontend/preview.html", "backend/requirements.txt", "backend/app/main.py", "backend/app/api/routes.py", "backend/app/schemas/contracts.py", "backend/app/security/access_control.py", "backend/app/services/application_service.py", "backend/app/repositories/application_repository.py", "backend/tests/test_api.py"];
  for (const path of required) if (!seen.has(path)) throw new ApiError(422, "MODEL_REQUIRED_FILE_MISSING", `The generated manifest is missing ${path}.`);
  if (files.filter((file) => file.path.startsWith("frontend/src/")).length < 6) throw new ApiError(422, "MODEL_FRONTEND_MONOLITH", "The generated frontend must contain at least six source modules.");
  if (files.filter((file) => file.path.startsWith("backend/app/")).length < 7) throw new ApiError(422, "MODEL_BACKEND_MONOLITH", "The generated Python backend must contain at least seven source modules.");
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  let packageManifest: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    packageManifest = JSON.parse(byPath.get("package.json") ?? "") as typeof packageManifest;
  } catch {
    throw new ApiError(422, "MODEL_PACKAGE_INVALID", "Generated package.json is not valid JSON.");
  }
  for (const script of ["dev", "build", "test"]) if (!packageManifest.scripts?.[script]) throw new ApiError(422, "MODEL_PACKAGE_SCRIPT_MISSING", `Generated package.json is missing the ${script} script.`);
  if (!(packageManifest.dependencies?.react || packageManifest.devDependencies?.react)) throw new ApiError(422, "MODEL_REACT_MISSING", "Generated package.json does not include React.");
  const preview = byPath.get("frontend/preview.html") ?? "";
  if (!/^<!doctype html>/i.test(preview) || !/<header[\s>]/i.test(preview) || !/<main[\s>]/i.test(preview) || !/<\/html>/i.test(preview)) throw new ApiError(422, "MODEL_PREVIEW_INVALID", "Generated preview must be a complete semantic HTML document.");
  if (!preview.toLocaleLowerCase().includes(specification.productName.toLocaleLowerCase())) throw new ApiError(422, "MODEL_PRODUCT_NAME_MISSING", "Generated preview must display the approved product name.");
  if (!/<script[\s>]/i.test(preview) || !/data-action=/i.test(preview) || /href=["']#["']/i.test(preview)) throw new ApiError(422, "MODEL_INTERACTIONS_INVALID", "Generated preview must contain testable interactions and no dead hash links.");
  if (/Keep every[\s\S]{0,100}moving\.|Live workspace\s*·\s*Preview data|84\.6%/i.test(preview)) {
    throw new ApiError(422, "MODEL_TEMPLATE_REUSE", "The generated customer website reused ForgeWeb's legacy workspace composition instead of the approved prompt-specific design.");
  }
  if (/light\s*-?\s*cream|lightcream|cream(?:y)?\s+(?:background|palette|aesthetic)|ivory|warm beige/i.test(specification.prompt) && !hasLightCreamSurface(preview)) {
    throw new ApiError(422, "MODEL_VISUAL_CONSTRAINT_VIOLATION", "The generated preview did not implement the customer's explicit light-cream background requirement.");
  }
  if (!/export\s+default\s+function|export\s+default\s+[A-Z]/.test(byPath.get("frontend/src/App.tsx") ?? "")) throw new ApiError(422, "MODEL_APP_INVALID", "Generated App.tsx must export the application component.");
  if (!/FastAPI\s*\(/.test(byPath.get("backend/app/main.py") ?? "")) throw new ApiError(422, "MODEL_SERVER_INVALID", "Generated backend entry must construct a FastAPI application.");
  if (!/authorize|access|role|permission/i.test(byPath.get("backend/app/security/access_control.py") ?? "")) throw new ApiError(422, "MODEL_ACCESS_CONTROL_INVALID", "Generated access-control module does not contain an authorization boundary.");
  return files;
}

function createApiContract(specification: MasterSpecification): { version: string; product: string; routes: Array<{ method: string; path: string }> } {
  const routes = (specification.architecture.backend.routes ?? []).map((route) => {
    const match = route.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    return match ? { method: match[1].toUpperCase(), path: match[2] } : { method: "GET", path: route.trim() };
  });
  return { version: "1.0", product: specification.productName, routes };
}

function requirementsMarkdown(specification: MasterSpecification): string {
  return [`# ${specification.productName} Requirements`, "", specification.summary, "", ...specification.requirements.flatMap((requirement) => [
    `## ${requirement.id} — ${requirement.title}`,
    "",
    requirement.description,
    "",
    ...requirement.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
  ])].join("\n");
}

function createFrontendSupportFiles(specification: MasterSpecification): ProviderManifest["files"] {
  const requirementIds = specification.requirements.map((requirement) => requirement.id);
  const title = specification.productName.replace(/[<>&"]/g, "");
  return [
    { path: "index.html", content: `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head><body><div id="root"></div><script type="module" src="/frontend/src/main.tsx"></script></body></html>\n`, requirementIds },
    { path: "tsconfig.json", content: `${JSON.stringify({ compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["frontend/src"] }, null, 2)}\n`, requirementIds },
    { path: "frontend/src/vite-env.d.ts", content: '/// <reference types="vite/client" />\n', requirementIds },
  ];
}

function createBackendSupportFiles(specification: MasterSpecification): ProviderManifest["files"] {
  const requirementIds = specification.requirements.map((requirement) => requirement.id);
  return [
    { path: "backend/requirements.txt", content: "fastapi==0.116.1\nuvicorn[standard]==0.35.0\npydantic==2.11.7\npytest==8.4.1\nhttpx==0.28.1\n", requirementIds },
    { path: "backend/app/__init__.py", content: "# Generated application package.\n", requirementIds },
    { path: "backend/app/repositories/application_repository.py", content: "class Repository:\n    def __init__(self): self._records = {}\n    def list(self): return list(self._records.values())\n    def get(self, record_id): return self._records.get(record_id)\n    def save(self, record): self._records[record['id']] = record; return record\n    def delete(self, record_id): return self._records.pop(record_id, None)\nrepository = Repository()\n", requirementIds },
    { path: "backend/app/security/access_control.py", content: "from fastapi import HTTPException\n\ndef require_role(role: str, allowed_roles: list[str]) -> None:\n    if role not in allowed_roles: raise HTTPException(status_code=403, detail='Forbidden')\n", requirementIds },
    { path: "backend/tests/test_api.py", content: "from fastapi.testclient import TestClient\nfrom app.main import app\n\ndef test_health():\n    response = TestClient(app).get('/health')\n    assert response.status_code == 200\n", requirementIds },
  ];
}

function unique(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function hasLightCreamSurface(preview: string): boolean {
  const creamToken = /(?:cream|ivory|beige|oldlace|floralwhite|#f[0-9a-f]{5}|#fff(?:fff)?|rgb\(\s*2[3-5]\d\s*,\s*2[2-5]\d\s*,\s*2[0-5]\d)/i;
  const rootSurface = /(?:html|body|:root|\.[\w-]*(?:shell|site|page|app))[^{]*\{[^}]*?(?:--(?:bg|background)|background(?:-color)?)\s*:[^;}]+/gi;
  return [...preview.matchAll(rootSurface)].some((match) => creamToken.test(match[0])) && !/color-scheme\s*:\s*dark/i.test(preview);
}
