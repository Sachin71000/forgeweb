import type { GeneratedFile, MasterSpecification, ProductKind, Requirement } from "../domain.ts";
import { persistentRepository } from "../generation/persistent-repository.ts";
import {SolConnection} from './sol-connection.ts';
import {generateFrontendPages} from '../generation/page-generation.ts';
import {pythonDependencyContext} from '../generation/python-context.ts';
import { createRequestPacer, type RequestPacer } from "./request-pacer.ts";
import { validatePythonSyntax, validatePythonModuleLinks } from "../python-validation.ts";
import { GenerationEvidence } from "./generation-evidence.ts";
import { withFrontendContract, frontendTypes } from '../generation/frontend-contract.ts';
import {schemaBindingIssues} from '../generation/schema-binding-check.ts';
import {validateApplicationSchema} from '../generation/application-schema.ts';
import {fileDependencyContext} from '../generation/file-context.ts';
import {editPrompt,editSchema,type EditRequest,type EditPatch} from '../generation/project-edit.ts';
import { frontendStyleSupport } from '../generation/style-support.ts';
import { frontendSourceIssues } from '../generation/frontend-quality.ts';
import { GENERATED_AI_TEMPLATE } from "../generated-frontend.ts";
import { ApiError, digest, safePath } from "../lib.ts";
import { fetchWithRetry, networkFailureDetail, redactProviderDetail } from "./transport.ts";
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
function validPreviewForStage(html:string,productName:string):boolean{
  const text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,'').toLowerCase();
  return /^\s*<!doctype html>/i.test(html)&&/<(?:header|nav)[\s>]/i.test(html)&&/<main[\s>]/i.test(html)&&/<\/html>/i.test(html)&&/<script[\s>]/i.test(html)&&/data-action\s*=/.test(html)&&!/href\s*=\s*["']#["']/i.test(html)&&!/<script\b[^>]*\bsrc\s*=/i.test(html)&&!/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html)&&text.includes(productName.replace(/\s+/g,'').toLowerCase());
}
function validFrontendSourceCheckpoint(files:ProviderManifest['files'],specification:MasterSpecification):boolean{
  if(!Array.isArray(files)||files.length!==8||new Set(files.map(file=>file?.path)).size!==8)return false;
  const allowed=new Set(specification.requirements.map(requirement=>requirement.id));
  if(!files.every(file=>file&&typeof file.path==='string'&&typeof file.content==='string'&&file.content.trim().length>1&&file.content.length<=180_000&&Array.isArray(file.requirementIds)&&file.requirementIds.length>0&&file.requirementIds.every(id=>allowed.has(id))&&(file.path==='package.json'||file.path==='INTERACTIONS.md'||/^frontend\/src\/[\w/.-]+$/.test(file.path))&&!file.path.split('/').includes('..')))return false;
  if(!['package.json','INTERACTIONS.md','frontend/src/App.tsx','frontend/src/main.tsx','frontend/src/styles.css','frontend/src/lib/api.ts'].every(path=>files.some(file=>file.path===path))||frontendSourceIssues(files).length)return false;
  try{const pkg=JSON.parse(files.find(file=>file.path==='package.json')!.content);return Boolean(pkg?.scripts?.dev&&pkg?.scripts?.build);}catch{return false;}
}
function frontendContextDigest(specification:MasterSpecification):string{
  // Transport bookkeeping may be written while Stitch is in flight. It is not
  // a frontend input; the complete saved design remains part of this digest.
  const {stitchRequest:_checkpoint,...context}=specification;
  return digest(JSON.stringify(context));
}
function validFrontendCheckpoint(files:ProviderManifest['files'],specification:MasterSpecification):boolean {
  if(!files.every(file=>file && typeof file.path==='string'&&typeof file.content==='string'&&Array.isArray(file.requirementIds)))return false;
  const allowed=new Set(specification.requirements.map(requirement=>requirement.id));
  const paths=new Set(files.map(file=>file.path));
  if(paths.size!==files.length || files.length!==9 || !files.every(file=>typeof file.path==='string'&&typeof file.content==='string'&&Array.isArray(file.requirementIds)))return false;
  if(!files.every(file=> (file.path==='package.json'||file.path==='INTERACTIONS.md'||/^frontend\/(src\/[\w/.-]+|preview\.html)$/.test(file.path)) && !file.path.split('/').includes('..') && file.content.length>1 && file.content.length<=180_000 && file.requirementIds.length>0 && file.requirementIds.every(id=>allowed.has(id))))return false;
  if(!['package.json','INTERACTIONS.md','frontend/src/App.tsx','frontend/src/main.tsx','frontend/src/styles.css','frontend/src/lib/api.ts','frontend/preview.html'].every(path=>paths.has(path)))return false;
  if(frontendSourceIssues(files).length)return false;
  const preview=files.find(file=>file.path==='frontend/preview.html')!.content;
  if(!validPreviewForStage(preview,specification.productName))return false;
  if(!preview.includes('forgeweb-ai-generated-v1')||!preview.toLowerCase().includes(specification.productName.toLowerCase())||!/<\/html>/i.test(preview))return false;
  try { const pkg=JSON.parse(files.find(file=>file.path==='package.json')!.content);return Boolean(pkg?.scripts?.build&&pkg?.scripts?.dev); }catch{return false;}
}
type EncodedBackendBundle = { mainPy: string; routesPy: string; domainPy: string; contractsPy: string; servicePy: string; requirementIds: string[] };

export interface ApplicationGenerationProvider {
  readonly id: "gemini-python" | "groq-openrouter" | "openrouter" | "groq" | "google-gemini" | "freellmapi" | "openai";
  readonly mode: "ai" | "gemini";
  readonly model: string;
  plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan>;
  generate(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: GeneratedFile[]) => Promise<void>): Promise<GeneratedFile[]>;
  edit?(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>;
}

const stringArray = { type: "array", items: { type: "string" } } as const;
async function editWithFallback(providers:ApplicationGenerationProvider[],spec:MasterSpecification,request:EditRequest):Promise<EditPatch>{
 const errors:string[]=[];for(const provider of [...new Set(providers)]){if(!provider.edit)continue;try{return await provider.edit(spec,request);}catch(error){errors.push(`${provider.id}: ${providerErrorMessage(error)}`);}}
 throw new ApiError(502,'EDIT_PROVIDER_FAILED',`AI editing failed; no changes were saved. ${errors.join(' ')}`);
}
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
function singleFileSchema(path:string){
  return {...manifestSchema,properties:{files:{...manifestSchema.properties.files,minItems:1,maxItems:1,items:{...manifestSchema.properties.files.items,properties:{...manifestSchema.properties.files.items.properties,path:{type:'string',enum:[path]}}}}}};
}
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

type GeminiResponse = { usageMetadata?: {promptTokenCount?:number;candidatesTokenCount?:number;thoughtsTokenCount?:number;totalTokenCount?:number}; candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
type ChatCompletionResponse = { choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
const groqPacers = new Map<string, RequestPacer>();

export class GeminiGenerationProvider implements ApplicationGenerationProvider {
  edit(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>{return this.request(editPrompt(specification,request),editSchema,4800);}
  readonly id = "google-gemini" as const;
  readonly mode = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly evidence?: GenerationEvidence;

  constructor(apiKey: string, model = "gemini-3-flash-preview", evidence?: GenerationEvidence) {
    if (!apiKey.trim()) throw new Error("Gemini API key is required.");
    this.apiKey = apiKey;
    this.model = model;
    this.evidence = evidence;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.request<ProviderPlan>(planningPrompt(prompt, fallback), planSchema, 4_500);
  }

  async generate(specification: MasterSpecification, onProgress?: (detail:string)=>Promise<void>, checkpoint?: (files:GeneratedFile[])=>Promise<void>): Promise<GeneratedFile[]> {
    const frontend = await this.generateFrontendManifest(specification);
    await checkpoint?.(frontend.files.map(file=>({...file,digest:digest(file.content)})));
    const backend = await this.generateBackendManifest(withFrontendContract(specification,frontend.files),onProgress,async files=>checkpoint?.([...frontend.files,...files].map(file=>({...file,digest:digest(file.content)}))));
    return composeProviderApplication(frontend, backend, specification);
  }

  async generateBackendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest> {
    const paths = ['backend/app/models/domain.py', 'backend/app/schemas/contracts.py', 'backend/app/services/application_service.py', 'backend/app/api/routes.py', 'backend/app/main.py'];
    const files: ProviderManifest['files'] = [];
    for (const path of paths) {
      const prompt = [
        backendImplementationPrompt(specification, true),
        `FILE-BY-FILE OVERRIDE: Return exactly ONE file: ${path}. Use raw Python text in content, NEVER Base64. Other files are generated separately. Produce a complete concise implementation without truncating validation or required behavior.`,
        `Approved backend paths: ${paths.join(', ')}. Do not import unrequested modules.`,
        `Previously accepted source; preserve its signatures/imports: ${JSON.stringify(files)}`,
      ].join('\n\n');
      const cacheKey = `gemini-plain-python-v2-low-thinking:${this.model}:${digest(this.apiKey)}:${prompt}`;
      const cached = await this.evidence?.cachedFile(cacheKey);
      if (cached?.path === path && (await validatePythonSyntax([{...cached,digest:digest(cached.content)}])).status === 'passed') {
        files.push(cached);
        await checkpoint?.([...files]);
        await onProgress?.(`Reusing syntax-checked Gemini backend ${files.length}/${paths.length}: ${path}. Runtime validation remains pending.`);
        continue;
      }
      await onProgress?.(`Gemini backend ${files.length+1}/${paths.length}: generating ${path} as plain source.`);
      let manifest = await this.requestOnce<ProviderManifest>(prompt, singleFileSchema(path), 4_096);
      for (let attempt = 0; attempt < 2; attempt++) {
        const file = manifest.files?.[0];
        if (!Array.isArray(manifest.files) || manifest.files.length !== 1 || file?.path !== path || typeof file.content !== 'string' || !file.content.trim() || !Array.isArray(file.requirementIds) || !file.requirementIds.every((item) => typeof item === 'string')) {
          await this.evidence?.record({event:'backend_file_shape_rejected',provider:this.id,model:this.model,path,receivedManifest:manifest}).catch(()=>console.warn('Local rejected manifest could not be saved.'));
          throw new ApiError(502,'GEMINI_BACKEND_FILE_INVALID',`Gemini must return exactly one source file at ${path}. No source was accepted.`);
        }
        const check = await validatePythonSyntax([{...file,digest:digest(file.content)}]);
        if (check.status === 'passed') {
          files.push(file);
          await this.evidence?.cacheFile(cacheKey,file).catch(()=>console.warn('Local generation cache could not be saved.'));
          await checkpoint?.([...files]);
          await onProgress?.(`Received syntax-checked Gemini backend ${files.length}/${paths.length}: ${path}. Runtime validation remains pending.`);
          break;
        }
        await this.evidence?.record({event:'python_syntax_rejected',provider:this.id,model:this.model,path,attempt:attempt+1,evidence:check.evidence,rejectedFile:file}).catch(()=>console.warn('Local generation evidence could not be saved.'));
        if (attempt === 1) throw new ApiError(502,'GEMINI_PYTHON_REPAIR_EXHAUSTED',`${path} failed syntax validation after one repair. ${check.evidence}`);
        await onProgress?.(`Repairing Gemini Python syntax in ${path}.`);
        manifest = await this.requestOnce<ProviderManifest>(`${prompt}\n\nCorrect only this rejected file. Compiler error: ${check.evidence}. Previous source: ${JSON.stringify(file)}`,singleFileSchema(path),4_096);
      }
    }
    return {files};
  }

  async generateFrontendManifest(specification: MasterSpecification): Promise<ProviderManifest> {
    const prompt=frontendImplementationPrompt(specification,false);
    const cacheKey=`gemini-react-v2:${this.model}:${digest(this.apiKey)}:${frontendContextDigest(specification)}:${FORGEWEB_MASTER_GENERATION_PROMPT}:${prompt}`;
    const cached=await this.evidence?.cachedManifest(cacheKey);
    if(cached && validFrontendCheckpoint(cached,specification))return {files:cached};
    const sourceKey=cacheKey+':source-v1';
    const cachedSource=await this.evidence?.cachedManifest(sourceKey);
    const source = cachedSource&&validFrontendSourceCheckpoint(cachedSource,specification)?{files:cachedSource}:await this.request<ProviderManifest>(prompt, manifestSchema, 8_000);
    if (!Array.isArray(source.files) || source.files.some((file) => file.path === "frontend/preview.html")) {
      throw new ApiError(422, "MODEL_MANIFEST_INVALID", "The frontend source stage must return source files without a preview.");
    }
    const issues=frontendSourceIssues(source.files);
    if(issues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',issues.join('; '));
    if(!validFrontendSourceCheckpoint(source.files,specification))throw new ApiError(422,'MODEL_MANIFEST_INVALID','Frontend source must contain exactly the approved eight distinct, requirement-linked files and runnable package scripts.');
    await this.evidence?.cacheManifest(sourceKey,source.files).catch(()=>console.warn('Local source checkpoint could not be saved.'));
    const previewPrompt = [
      "Generate only frontend/preview.html as one file in the files array. Do not return any other files.",
      "Create a complete standalone HTML document faithfully matching the supplied React application, its styles, product identity, navigation, and functional interactions. Include embedded plain CSS and safe inline JavaScript, a semantic header or nav plus a main element, data-action attributes, and the forgeweb-ai-generated-v1 marker. No external scripts, imports, stylesheet links, Tailwind CDN or dead hash links: the sandbox blocks them. Translate utility classes into real embedded CSS. Do not invent social/profile/Journal links when the brief supplies no real destination; omit them or show noninteractive text instead of fake clickable anchors. Keep output under 9000 characters.",
      `Approved customer prompt: ${specification.prompt}`,
      `Approved product name: ${specification.productName}`,
      `Requirement IDs: ${specification.requirements.map((requirement) => requirement.id).join(", ")}`,
      `React source: ${JSON.stringify(source.files)}`,
    ].join("\n\n");
    let preview=await this.request<ProviderManifest>(previewPrompt,manifestSchema,8_000);
    for(let attempt=0;attempt<2;attempt++){
      const received=Array.isArray(preview.files)&&preview.files.length===1&&preview.files[0]?.path==='frontend/preview.html'&&typeof preview.files[0].content==='string'?preview.files[0]:undefined;
      if(received&&validPreviewForStage(received.content,specification.productName))break;
      await this.evidence?.record({event:'preview_rejected',provider:this.id,attempt:attempt+1,rejectedFile:received??preview}).catch(()=>console.warn('Preview diagnostic could not be saved.'));
      if(attempt===1)throw new ApiError(422,'MODEL_PREVIEW_INVALID','Preview failed its semantic structure, approved-product, scripted data-action or dead-link check after one preview-only repair. Backend generation was not started.');
      preview=await this.requestOnce<ProviderManifest>(`${previewPrompt}\n\nPREVIEW-ONLY REPAIR: Keep the React source unchanged. Return one complete preview.html with <!doctype html>, header or nav, main, closing html, the approved product name in visible text, the forgeweb-ai-generated-v1 marker, scripted controls with data-action attributes and no href="#" links. REMOVE external script src, Tailwind CDN and external stylesheet links. Implement all necessary CSS in style tags. Previous rejected preview DATA: ${JSON.stringify(received??preview)}`,manifestSchema,8_000);
    }
    if (!Array.isArray(preview.files) || preview.files.length !== 1 || preview.files[0].path !== "frontend/preview.html") {
      throw new ApiError(422, "MODEL_MANIFEST_INVALID", "The preview stage must return exactly frontend/preview.html.");
    }
    if(typeof preview.files[0].content!=='string'||!validPreviewForStage(preview.files[0].content,specification.productName))throw new ApiError(422,'MODEL_PREVIEW_INVALID','Preview must contain the approved product, semantic header/main, scripted data-action interactions and no dead hash links. Backend generation was not started.');
    const files=[...source.files,...preview.files];
    if(validFrontendCheckpoint(files,specification))await this.evidence?.cacheManifest(cacheKey,files).catch(()=>console.warn('Local frontend checkpoint could not be saved.'));
    return { files };
  }

  async cachedFrontendManifest(specification:MasterSpecification):Promise<ProviderManifest|undefined>{
    if(!this.evidence)return undefined;
    const prompt=frontendImplementationPrompt(specification,false);
    const key=`gemini-react-v2:${this.model}:${digest(this.apiKey)}:${frontendContextDigest(specification)}:${FORGEWEB_MASTER_GENERATION_PROMPT}:${prompt}`;
    const cached=await this.evidence?.cachedManifest(key);
    return cached&&validFrontendCheckpoint(cached,specification)?{files:cached}:undefined;
  }

  private async request<T>(prompt: string, schema: object, maxOutputTokens: number): Promise<T> {
    try {
      return await this.requestOnce<T>(prompt, schema, maxOutputTokens);
    } catch (error) {
      if (!(error instanceof ApiError) || !["GEMINI_INVALID_JSON", "GEMINI_TRUNCATED"].includes(error.code)) throw error;
      return this.requestOnce<T>(`${prompt}\n\nThe previous response was incomplete or invalid JSON. Return a complete, concise JSON object matching the schema. Escape source strings correctly. No markdown fences or commentary.`, schema, Math.min(maxOutputTokens * 2, 16_000));
    }
  }

  private async requestOnce<T>(prompt: string, schema: object, maxOutputTokens: number): Promise<T> {
    const started = Date.now();
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
            ...(/^gemini-3(?:[.-]|$)/i.test(this.model) ? {thinkingConfig:{thinkingLevel:'low'}} : {}),
            responseMimeType: "application/json",
            responseJsonSchema: schema,
          },
        }),
      });
      if (!response.ok) {
        const raw = redactProviderDetail(await response.text(), this.apiKey);
        await this.evidence?.record({ event: 'provider_rejection', provider: this.id, model: this.model, maxOutputTokens, httpStatus: response.status, elapsedMs: Date.now() - started, response: raw.slice(0, 512_000) }).catch(() => console.warn('Local generation evidence could not be saved.'));
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
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new SyntaxError('Expected provider response object');
      const candidate = payload.candidates?.[0];
      const output = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('') ?? '';
      const usage=Object.fromEntries(Object.entries(payload.usageMetadata??{}).filter(([key,value])=>['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'].includes(key)&&typeof value==='number'&&Number.isFinite(value)));
      await this.evidence?.record({ event: 'provider_response', provider: this.id, model: this.model, maxOutputTokens, usage, finishReason: candidate?.finishReason, elapsedMs: Date.now() - started, outputCharacters: output.length, ...(candidate?.finishReason !== 'STOP' ? { rejectedOutput: output.slice(0,512_000) } : {}) }).catch(() => console.warn('Local generation evidence could not be saved.'));
      if (candidate?.finishReason === "MAX_TOKENS") throw new ApiError(502, "GEMINI_TRUNCATED", "Gemini reached its output token limit before completing the JSON response.");
      if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new ApiError(502, "GEMINI_OUTPUT_STOPPED", "Gemini stopped generation before returning a complete application.");
      const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
      if (!text) throw new ApiError(502, "GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
      try {
        const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("Expected a JSON object");
        return parsed as T;
      } catch {
        await this.evidence?.record({ event:'invalid_json',provider:this.id,model:this.model,rejectedOutput:text.slice(0,512_000) }).catch(() => console.warn('Local generation evidence could not be saved.'));
        throw new ApiError(502, "GEMINI_INVALID_JSON", "Gemini returned invalid structured output.");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === "AbortError") throw new ApiError(504, "GEMINI_TIMEOUT", "Gemini generation exceeded the two-minute limit.");
      if (error instanceof SyntaxError) throw new ApiError(502, "GEMINI_INVALID_JSON", "Gemini returned an invalid JSON response envelope.");
      throw new ApiError(502, "GEMINI_UNAVAILABLE", `Gemini could not be reached from the ForgeWeb server. ${networkFailureDetail(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function decodeBackendBundle(encoded: EncodedBackendBundle): ProviderManifest {
  const paths: Array<[string, keyof EncodedBackendBundle]> = [
    ["backend/app/main.py", "mainPy"],
    ["backend/app/api/routes.py", "routesPy"],
    ["backend/app/models/domain.py", "domainPy"],
    ["backend/app/schemas/contracts.py", "contractsPy"],
    ["backend/app/services/application_service.py", "servicePy"],
  ];
  return { files: paths.map(([path, field]) => ({
    path,
    content: Buffer.from(encoded[field] as string, "base64").toString("utf8"),
    requirementIds: encoded.requirementIds,
  })) };
}

type CompatibleProviderId = "openrouter" | "groq" | "freellmapi" | "openai";

class OpenAiCompatibleGenerationProvider implements ApplicationGenerationProvider {
  edit(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>{return this.request(editPrompt(specification,request),editSchema,'forgeweb_project_edit',4800);}
  readonly mode = "ai" as const;
  readonly id: CompatibleProviderId;
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly plainBackend: boolean;
  private readonly pacer?: RequestPacer;
  private readonly evidence?: GenerationEvidence;
  private sol?:SolConnection;

  constructor(
    id: CompatibleProviderId,
    apiKey: string,
    model: string,
    endpoint: string,
    plainBackend = false,
    pacer?: RequestPacer,
    evidence?: GenerationEvidence,
    sol?:SolConnection,
  ) {
    if (!apiKey.trim()) throw new Error(`${id} API key is required.`);
    this.id = id;
    this.sol=sol;
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint;
    this.plainBackend = plainBackend;
    this.pacer = pacer;
    this.evidence = evidence;
  }

  async plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    if (this.id === 'freellmapi') return this.gatewayRequest(planningPrompt(prompt, fallback), planSchema, 'forgeweb_architecture', 4_500);
    return this.request<ProviderPlan>(planningPrompt(prompt, fallback), planSchema, "forgeweb_architecture", 4_500);
  }

  async generate(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: GeneratedFile[]) => Promise<void>): Promise<GeneratedFile[]> {
    const save = async (files: ProviderManifest['files']) => checkpoint?.(files.map(file=>({...file,digest:digest(file.content)})));
    const frontend = await this.generateFrontendManifest(specification, onProgress, save);
    await save(frontend.files);
    const backend = await this.generateBackendManifest(withFrontendContract(specification,frontend.files), onProgress, async files=>save([...frontend.files,...files]));
    await save([...frontend.files,...backend.files]);
    try{return await composeProviderApplication(frontend, backend, specification);}
    catch(error){await this.evidence?.record({event:'application_validation_rejected',provider:this.id,model:this.model,message:providerErrorMessage(error),files:[...frontend.files,...backend.files]});throw error;}
  }

  async generateFrontendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest> {
    if(this.id==='openai'){
      if(!this.evidence)throw new ApiError(503,'FRONTEND_CHECKPOINT_UNAVAILABLE','Sol page generation requires persistent checkpoints.');
      const manifest=await generateFrontendPages(specification,(prompt,path,budget)=>this.request(prompt,singleFileSchema(path),'forgeweb_frontend_file',budget),this.evidence,onProgress,checkpoint);
      const issues=frontendSourceIssues(manifest.files);if(issues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',issues.join('; '));
      return manifest;
    }
    const prompt = frontendImplementationPrompt(specification);
    const cacheKey=`react-checkpoint-v2:${this.id}:${this.model}:${digest(this.apiKey)}:${frontendContextDigest(specification)}:${FORGEWEB_MASTER_GENERATION_PROMPT}:${prompt}`;
    const cached=await this.evidence?.cachedManifest(cacheKey);
    if(cached && validFrontendCheckpoint(cached,specification)){
      await onProgress?.('Reusing received frontend checkpoint. Final compilation and runtime validation remain pending.');
      return {files:cached};
    }
    if (this.pacer || this.id === 'freellmapi') {
      const manifest=await this.generateFiles(prompt, ["package.json", "frontend/src/styles.css", "frontend/src/components/ProductContent.tsx", "frontend/src/pages/ProductPage.tsx", "frontend/src/lib/api.ts", "frontend/src/App.tsx", "frontend/src/main.tsx", "INTERACTIONS.md", "frontend/preview.html"], onProgress, checkpoint);
      const issues=frontendSourceIssues(manifest.files);
      if(issues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',issues.join('; '));
      if(validFrontendCheckpoint(manifest.files,specification))await this.evidence?.cacheManifest(cacheKey,manifest.files).catch(()=>console.warn('Local frontend checkpoint could not be saved.'));
      return manifest;
    }
    try {
      const manifest=await this.request<ProviderManifest>(prompt, manifestSchema, "forgeweb_react_frontend", 5_200);
      if(Array.isArray(manifest.files)){
        const issues=frontendSourceIssues(manifest.files);
        if(issues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',issues.join('; '));
      }
      if(Array.isArray(manifest.files)&&validFrontendCheckpoint(manifest.files,specification))await this.evidence?.cacheManifest(cacheKey,manifest.files).catch(()=>console.warn('Local frontend checkpoint could not be saved.'));
      return manifest;
    } catch (error) {
      const message = providerErrorMessage(error);
      if (this.id !== "groq" || !/status 400|json_validate_failed|Failed to generate JSON/i.test(message)) throw error;
      const manifest=await this.request<ProviderManifest>(prompt, manifestSchema, "forgeweb_react_frontend", 4_800, "json_object");
      if(!Array.isArray(manifest.files))throw new ApiError(422,'MODEL_MANIFEST_INVALID','Frontend generation must return a files array.');
      const issues=frontendSourceIssues(manifest.files);
      if(issues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',issues.join('; '));
      return manifest;
    }
  }

  async cachedFrontendManifest(specification:MasterSpecification):Promise<ProviderManifest|undefined>{
    if(!this.evidence)return undefined;
    const prompt=frontendImplementationPrompt(specification);
    const key=`react-checkpoint-v2:${this.id}:${this.model}:${digest(this.apiKey)}:${frontendContextDigest(specification)}:${FORGEWEB_MASTER_GENERATION_PROMPT}:${prompt}`;
    const cached=await this.evidence?.cachedManifest(key);
    return cached&&validFrontendCheckpoint(cached,specification)?{files:cached}:undefined;
  }

  async generateBackendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest> {
    if (this.plainBackend || this.id === 'freellmapi') {
      const required = ["backend/app/main.py", "backend/app/api/routes.py", "backend/app/models/domain.py", "backend/app/schemas/contracts.py", "backend/app/services/application_service.py"];
      const order = [required[2], required[3], required[4], required[1], required[0]];
      const manifest = await this.generateFiles(backendImplementationPrompt(specification, true), order, onProgress, checkpoint);
      if (!Array.isArray(manifest.files) || manifest.files.length !== required.length || new Set(manifest.files.map((file) => file.path)).size !== required.length || manifest.files.some((file) => !required.includes(file.path) || typeof file.content !== "string" || !Array.isArray(file.requirementIds))) {
        throw new ApiError(422, "MODEL_MANIFEST_INVALID", "Backend must return exactly the five approved Python source files.");
      }
      const check = await validatePythonSyntax(manifest.files.map((file) => ({ ...file, digest: digest(file.content) })));
      if (check.status !== "passed") throw new ApiError(422, "MODEL_PYTHON_INVALID", check.evidence);
      return manifest;
    }
    const encoded = await this.request<EncodedBackendBundle>(backendImplementationPrompt(specification), encodedBackendSchema, "forgeweb_python_backend", 3_500);
    return decodeBackendBundle(encoded);
  }

  private async generateFiles(prompt: string, paths: string[], onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest> {
    const files: ProviderManifest["files"] = [];
    for (const path of paths) {
      const gateway = this.id === 'freellmapi';
      const budget = this.id==='openai'?(path.endsWith('application_service.py')?12000:6000):gateway ? (path.endsWith('preview.html') ? 4_800 : 3_200) : 800;
      await onProgress?.(gateway||this.id==='openai' ? `Generating ${files.length + 1}/${paths.length}: ${path}.` : `Free-tier generation ${files.length + 1}/${paths.length}: ${path}. Waiting for the shared rate-limit slot, then requesting source.`);
      let filePrompt = [
        prompt,
        `FILE-BY-FILE OVERRIDE: Earlier bundle-size instructions are replaced for this request. Return exactly ONE file: ${path}. Use ordinary raw source in the content JSON string, NEVER Base64. All other files are generated separately. Complete this file within ${budget} output tokens; use concise code but preserve required validation and behavior. No unrequested imports/modules.`,
        `The entire generation manifest will use only these paths: ${paths.join(", ")}.`,
        `Previously completed ${gateway ? 'dependency contracts (omitted bodies are not missing functionality)' : 'source'} (match signatures and imports exactly): ${JSON.stringify(gateway ? fileDependencyContext(files,path) : files)}`,
      ].join("\n\n");
      const cacheKey = `${this.id}:${this.model}:${digest(this.apiKey)}:${filePrompt}`;
      const cached = gateway || path.endsWith('.py') ? await this.evidence?.cachedFile(cacheKey) : undefined;
      if (cached?.path === path) {
        const reusable = path.endsWith('.py')
          ? (await validatePythonSyntax([{ ...cached, digest: digest(cached.content) }])).status === 'passed'
          : frontendSourceIssues([cached]).length === 0;
        if (reusable) {
          files.push(cached);
          await checkpoint?.([...files]);
          await onProgress?.(`Reusing checked source ${files.length}/${paths.length}: ${path}. Final validation is still pending.`);
          await this.evidence?.record({event:'cache_hit',provider:this.id,model:this.model,path,networkRequests:0}).catch(() => console.warn('Local generation evidence could not be saved.'));
          continue;
        }
      }
      if(this.id==='openai'&&path.endsWith('.py'))filePrompt=filePrompt.replace(`Previously completed source (match signatures and imports exactly): ${JSON.stringify(files)}`,`Previously completed dependency signatures; omitted bodies are complete, not missing: ${JSON.stringify(await pythonDependencyContext(files))}`);
      const requestFile = (text: string) => gateway
        ? this.gatewayRequest<ProviderManifest>(text, singleFileSchema(path), 'forgeweb_single_file', budget, path, onProgress)
        : this.request<ProviderManifest>(text, singleFileSchema(path), 'forgeweb_single_file', budget);
      let manifest = await requestFile(filePrompt);
      for (let attempt = 0; attempt < 2; attempt++) {
      if (!Array.isArray(manifest.files) || manifest.files.length !== 1 || manifest.files[0].path !== path || typeof manifest.files[0].content !== "string" || !manifest.files[0].content.trim() || !Array.isArray(manifest.files[0].requirementIds)) {
        throw new ApiError(422, "MODEL_MANIFEST_INVALID", `Expected one complete source file at ${path}.`);
      }
        if (!path.endsWith(".py")) break;
        const syntax = await validatePythonSyntax(manifest.files.map((file) => ({ ...file, digest: digest(file.content) })));
        if (syntax.status === "passed") break;
        await this.evidence?.record({event:'python_syntax_rejected',provider:this.id,model:this.model,path,attempt:attempt+1,evidence:syntax.evidence,rejectedFile:manifest.files[0]}).catch(() => console.warn('Local generation evidence could not be saved.'));
        if (attempt === 1) throw new ApiError(502, "MODEL_PYTHON_REPAIR_EXHAUSTED", `${path} failed syntax validation after one paced repair. ${syntax.evidence}`);
        await onProgress?.(`Repairing Python syntax in ${path}; waiting for the next free-tier slot.`);
        manifest = await requestFile(`${filePrompt}\n\nSyntax validation failed: ${syntax.evidence}. Correct only this file. Return raw valid Python inside content, no markdown fences and no Base64. Previous rejected file: ${JSON.stringify(manifest.files[0])}`);
      }
      files.push(manifest.files[0]);
      if (gateway && !path.endsWith('.py')) {
        const issues = frontendSourceIssues([manifest.files[0]]);
        if (issues.length) throw new ApiError(422, 'MODEL_FRONTEND_INTERACTIONS_INVALID', issues.join('; '));
      }
      if (gateway || path.endsWith('.py')) await this.evidence?.cacheFile(cacheKey,manifest.files[0]).catch(() => console.warn('Local generation cache could not be saved.'));
      await checkpoint?.([...files]);
      await onProgress?.(`Received source ${files.length}/${paths.length}: ${path}. Validation is still pending.`);
    }
    return { files };
  }

  private async gatewayRequest<T>(prompt: string, schema: object, stage: string, budget: number, path?: string, onProgress?: (detail: string) => Promise<void>): Promise<T> {
    try {
      return await this.request<T>(prompt, schema, stage, budget);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (!['MODEL_TRUNCATED', 'MODEL_INVALID_JSON'].includes(error.code)) {
        throw new ApiError(error.status, error.code, `${path ?? stage}: ${error.message}`);
      }
      const retryBudget = Math.min(budget * 2, 9_600);
      await onProgress?.(`Retrying only ${path ?? stage} with a ${retryBudget}-token output budget; incomplete output was discarded.`);
      try {
        return await this.request<T>(`${prompt}\n\nThe previous response was truncated or invalid JSON. Start this response again, return complete valid JSON matching the schema, and keep source concise without removing required behavior.`, schema, stage, retryBudget);
      } catch (retryError) {
        if (!(retryError instanceof ApiError)) throw retryError;
        throw new ApiError(retryError.status, retryError.code, `${path ?? stage}: ${retryError.message} One output repair was attempted; completed files were retained.`);
      }
    }
  }

  private async request<T>(prompt: string, schema: object, schemaName: string, maxOutputTokens: number, responseMode: "json_schema" | "json_object" = "json_schema"): Promise<T> {
    if(this.id==='openai'){
      if(!this.sol)throw new ApiError(503,'OPENAI_NOT_CONFIGURED','Direct Sol connection is not configured.');
      const limit=schemaName==='forgeweb_react_frontend'?20000:schemaName==='forgeweb_architecture'?6000:Math.max(maxOutputTokens,6000);
      return this.sol.request<T>(FORGEWEB_MASTER_GENERATION_PROMPT,prompt,schema,schemaName,limit);
    }
    // Conservative local estimate, not a tokenizer or a quota guarantee. Reject
    // pathological payloads before waiting or making a known oversized call.
    const estimatedInputTokens=Math.ceil(Buffer.byteLength(FORGEWEB_MASTER_GENERATION_PROMPT+prompt+JSON.stringify(schema),'utf8')/3);
    if(this.id==='groq'&&this.pacer&&estimatedInputTokens>6500)throw new ApiError(422,'MODEL_INPUT_BUDGET_EXCEEDED',`Groq request exceeds the conservative local input estimate (${estimatedInputTokens} tokens; budget 6500). Compact the design/task context or use another configured provider.`);
    const queued = Date.now();
    if (this.pacer) {
      await this.pacer.wait();
      maxOutputTokens = Math.min(maxOutputTokens, 800);
    }
    const started = Date.now();
    const pacingWaitMs = started - queued;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetchWithRetry(this.endpoint, {
        method: "POST",
        ...(this.id === "freellmapi" ? { redirect: "error" as const } : {}),
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
      }, this.pacer ? 1 : 3);
      if (!response.ok) {
        const rawDetail = redactProviderDetail(await response.text(), this.apiKey).replace(/\s+/g, " ");
        await this.evidence?.record({event:'provider_rejection',provider:this.id,model:this.model,schemaName,maxOutputTokens,httpStatus:response.status,pacingWaitMs,networkMs:Date.now()-started,response:rawDetail.slice(0,512_000)}).catch(() => console.warn('Local generation evidence could not be saved.'));
        const detail = rawDetail.includes('"failed_generation"')
          ? rawDetail.slice(0, rawDetail.indexOf('"failed_generation"')).slice(0, 240)
          : rawDetail.slice(0, 240);
        throw new ApiError(502, "MODEL_REQUEST_FAILED", `${this.id} generation failed with status ${response.status}${detail ? `: ${detail}` : "."}`);
      }
      const payload = await response.json() as ChatCompletionResponse;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new SyntaxError('Expected provider response object');
      await this.evidence?.record({event:'provider_response',provider:this.id,model:this.model,schemaName,maxOutputTokens,finishReason:payload.choices?.[0]?.finish_reason,pacingWaitMs,networkMs:Date.now()-started,...(payload.choices?.[0]?.finish_reason==='length'?{rejectedOutput:payload.choices[0].message?.content?.slice(0,512_000)}:{})}).catch(() => console.warn('Local generation evidence could not be saved.'));
      if (payload.choices?.[0]?.finish_reason === "length") throw new ApiError(502, "MODEL_TRUNCATED", `${this.id} reached the ${schemaName} output limit (${maxOutputTokens} tokens). No incomplete source was accepted.`);
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new ApiError(502, "MODEL_EMPTY_RESPONSE", `${this.id} returned no structured output.`);
      try {
        const parsed: unknown = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Expected structured output object');
        return parsed as T;
      } catch {
        await this.evidence?.record({event:'invalid_json',provider:this.id,model:this.model,schemaName,rejectedOutput:content.slice(0,512_000)}).catch(() => console.warn('Local generation evidence could not be saved.'));
        throw new ApiError(502, "MODEL_INVALID_JSON", `${this.id} returned invalid structured output.`);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === "AbortError") throw new ApiError(504, "MODEL_TIMEOUT", `${this.id} generation exceeded the three-minute limit.`);
      if (error instanceof SyntaxError) throw new ApiError(502, "MODEL_INVALID_JSON", `${this.id} returned an invalid JSON response envelope.`);
      throw new ApiError(502, "MODEL_UNAVAILABLE", `${this.id} could not be reached from the ForgeWeb server. ${networkFailureDetail(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

class GroqOpenRouterGenerationProvider implements ApplicationGenerationProvider {
  edit(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>{return editWithFallback([this.implementer,this.planner],specification,request);}
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

  async generate(specification: MasterSpecification, onProgress?: (detail:string)=>Promise<void>, checkpoint?: (files:GeneratedFile[])=>Promise<void>): Promise<GeneratedFile[]> {
    try {
      return await this.implementer.generate(specification,onProgress,checkpoint);
    } catch (primaryError) {
      try {
        return await this.planner.generate(specification,onProgress,checkpoint);
      } catch (fallbackError) {
        throw combinedProviderError("generation", primaryError, fallbackError);
      }
    }
  }
}

class GeminiPythonGenerationProvider implements ApplicationGenerationProvider {
  edit(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>{return editWithFallback([this.gemini,this.backendPrimary,...(this.backendFallback?[this.backendFallback]:[])],specification,request);}
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
    this.model = `${gemini.model} (frontend + backend; fallbacks: ${backendPrimary.model}${backendFallback ? ` / ${backendFallback.model}` : ""})`;
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

  async generate(specification: MasterSpecification, _onProgress?: (detail:string)=>Promise<void>, checkpoint?: (files:GeneratedFile[])=>Promise<void>): Promise<GeneratedFile[]> {
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
    await checkpoint?.(frontendManifest.files.map(file=>({...file,digest:digest(file.content)})));
    let backendManifest: ProviderManifest;
    try {
      backendManifest = await this.gemini.generateBackendManifest(withFrontendContract(specification,frontendManifest.files));
    } catch (geminiError) {
      try {
        backendManifest = await this.backendPrimary.generateBackendManifest(withFrontendContract(specification,frontendManifest.files));
      } catch (primaryError) {
        if (!this.backendFallback) throw combinedProviderError("Python backend generation", geminiError, primaryError);
        try {
          backendManifest = await this.backendFallback.generateBackendManifest(withFrontendContract(specification,frontendManifest.files));
        } catch (fallbackError) {
          throw new ApiError(502, "PROVIDER_CHAIN_FAILED", `Python backend generation failed. Gemini: ${providerErrorMessage(geminiError)} Primary fallback: ${providerErrorMessage(primaryError)} Secondary fallback: ${providerErrorMessage(fallbackError)}`);
        }
      }
    }
    return composeProviderApplication(frontendManifest, backendManifest, specification);
  }
}

type StageProvider = ApplicationGenerationProvider & {
  cachedFrontendManifest?(specification:MasterSpecification):Promise<ProviderManifest|undefined>;
  generateFrontendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest>;
  generateBackendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest>;
};

export class FrontendDualGeminiBackendProvider implements ApplicationGenerationProvider {
  edit(specification:MasterSpecification,request:EditRequest):Promise<EditPatch>{return editWithFallback(/backend|database|api|endpoint|server/i.test(request.prompt)?this.backends:[...this.frontends,...this.geminis],specification,request);}
  readonly id = "gemini-python" as const;
  readonly mode = "ai" as const;
  readonly model: string;
  private readonly frontends: StageProvider[];
  private readonly geminis: StageProvider[];
  private readonly backends: StageProvider[];
  constructor(frontends: StageProvider[], geminis: StageProvider[], backends = geminis) {
    this.frontends = frontends;
    this.geminis = geminis;
    this.backends = backends;
    this.model = `Frontend: ${frontends.map((provider) => provider.model).join(" → ")}; backend: ${backends.map((provider) => provider.model).join(" → ")}`;
  }

  private async run<T>(stage: string, providers: StageProvider[], operation: (provider: StageProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (let index = 0; index < providers.length; index++) {
      try { return await operation(providers[index]); }
      catch (error) {
        if(error instanceof ApiError&&error.code.includes('CHECKPOINT'))throw error;
        errors.push(`${providers[index].id} option ${index + 1}: ${providerErrorMessage(error)}`);
        // Bounded failover across user-confirmed separate Google projects.
        // Each distinct configured key is attempted once, never an endless loop.
      }
    }
    throw new ApiError(502, "PROVIDER_CHAIN_FAILED", `${stage} failed. ${errors.join(" ")}`);
  }

  plan(prompt: string, fallback: MasterSpecification): Promise<ProviderPlan> {
    return this.run("Architecture planning", this.backends, (provider) => provider.plan(prompt, fallback));
  }

  generateBackendManifest(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: ProviderManifest['files']) => Promise<void>): Promise<ProviderManifest> {
    return this.run("Python backend generation", this.backends, (provider) => provider.generateBackendManifest(specification, onProgress, checkpoint));
  }

  async generate(specification: MasterSpecification, onProgress?: (detail: string) => Promise<void>, checkpoint?: (files: GeneratedFile[]) => Promise<void>): Promise<GeneratedFile[]> {
    const save=async (files:ProviderManifest['files'])=>checkpoint?.(files.map(file=>({...file,digest:digest(file.content)})));
    let frontend:ProviderManifest|undefined;
    for(const provider of [...this.frontends,...this.geminis]){
      frontend=await provider.cachedFrontendManifest?.(specification);
      if(frontend){await onProgress?.('Resuming received frontend checkpoint; final compile/runtime checks remain pending.');break;}
    }
    frontend ??= await this.run("React frontend generation", [...this.frontends, ...this.geminis], (provider) => provider.generateFrontendManifest(specification, onProgress,save));
    await save(frontend.files);
    const frontendFiles=frontend.files;
    const backend = await this.generateBackendManifest(withFrontendContract(specification,frontendFiles), onProgress,files=>save([...frontendFiles,...files]));
    await save([...frontendFiles,...backend.files]);
    return composeProviderApplication(frontend, backend, specification);
  }
}

export async function composeProviderApplication(frontendManifest: ProviderManifest, backendManifest: ProviderManifest, specification: MasterSpecification): Promise<GeneratedFile[]> {
  const requirements = specification.requirements.map((requirement) => requirement.id);
  const contract = createApiContract(specification,frontendManifest.files);
  const files=validateProviderManifest({ files: [
    ...frontendManifest.files,
    ...backendManifest.files,
    ...createFrontendSupportFiles(specification),
    ...frontendStyleSupport(frontendManifest.files,requirements),
    ...createBackendSupportFiles(specification),
    { path: "README.md", content: `# ${specification.productName}\n\n${specification.summary}\n\nThe React frontend and FastAPI backend share the contract in \`shared/api-contract.json\`.\n`, requirementIds: requirements },
    { path: "REQUIREMENTS.md", content: requirementsMarkdown(specification), requirementIds: requirements },
    { path: "ARCHITECTURE.md", content: specification.architecture.markdown, requirementIds: requirements },
    { path: "shared/api-contract.json", content: `${JSON.stringify(contract, null, 2)}\n`, requirementIds: requirements },
  ] }, specification);
  const links=await validatePythonModuleLinks(files);
  const bindingIssues=schemaBindingIssues(files);if(bindingIssues.length)throw new ApiError(422,'APPLICATION_BINDINGS_INVALID',bindingIssues.join('; '));
  if(links.status!=='passed')throw new ApiError(422,'MODEL_PYTHON_LINKS_INVALID',links.evidence);
  return files;
}

function combinedProviderError(stage: string, primaryError: unknown, fallbackError: unknown): ApiError {
  return new ApiError(502, "PROVIDER_CHAIN_FAILED", `${stage} failed. Primary: ${providerErrorMessage(primaryError)} Fallback: ${providerErrorMessage(fallbackError)}`);
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error";
}

export function createGenerationProviderFromEnv(environment: Record<string, string | undefined> = process.env, options: { groqPacer?: RequestPacer; evidence?: GenerationEvidence } = {}): ApplicationGenerationProvider | undefined {
  const requestedMode = environment.FORGEWEB_GENERATION_MODE?.toLowerCase() ?? "auto";
  if (requestedMode === "deterministic") return undefined;
  if(requestedMode==='openai'){
    const key=environment.OPENAI_API_KEY?.trim();if(!key)throw new Error('OPENAI_API_KEY is required for direct Sol generation.');
    const sol=new SolConnection(key,environment.FORGEWEB_DATA_DIR??'.forgeweb-data',Number(environment.FORGEWEB_OPENAI_TEST_LIMIT_USD??1));
    return new OpenAiCompatibleGenerationProvider('openai',key,'gpt-6.1-sol','https://api.openai.com/v1/responses',true,undefined,new GenerationEvidence(environment.FORGEWEB_DATA_DIR??'.forgeweb-data',[key]),sol);
  }
  const openRouterKey = environment.OPENROUTER_API_KEY;
  const groqKey = environment.GROQ_API_KEY;
  const geminiKey = environment.GOOGLE_API_KEY ?? environment.GEMINI_API_KEY;
  const evidence = options.evidence ?? (environment.FORGEWEB_GENERATION_DIAGNOSTICS === 'true' ? new GenerationEvidence(environment.FORGEWEB_DATA_DIR ?? '.forgeweb-data',Object.entries(environment).filter(([name,value])=>/KEY|TOKEN|SECRET/.test(name)&&value).map(([,value])=>value!)) : undefined);
  if (requestedMode === 'freellmapi' || environment.FORGEWEB_FREELLMAPI_ENABLED === 'true') {
    const key = environment.FREELLMAPI_API_KEY?.trim();
    if (!key || key.startsWith('replace_')) throw new Error('FreeLLMAPI requires FREELLMAPI_API_KEY in the server-side .env.local file.');
    let base: URL;
    try { base = new URL(environment.FREELLMAPI_BASE_URL ?? 'http://127.0.0.1:3001/v1'); }
    catch { throw new Error('FREELLMAPI_BASE_URL must be a loopback HTTP URL ending in /v1.'); }
    if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || !/^\/v1\/?$/.test(base.pathname)) {
      throw new Error('FREELLMAPI_BASE_URL must be a loopback HTTP URL ending in /v1 without credentials, query or fragment.');
    }
    const model = environment.FREELLMAPI_MODEL?.trim() || 'auto';
    const gatewayEvidence = evidence ?? new GenerationEvidence(environment.FORGEWEB_DATA_DIR ?? '.forgeweb-data', [key]);
    return new OpenAiCompatibleGenerationProvider('freellmapi', key, model, `${base.origin}/v1/chat/completions`, false, undefined, gatewayEvidence);
  }
  const openRouter = openRouterKey ? new OpenAiCompatibleGenerationProvider("openrouter", openRouterKey, environment.FORGEWEB_OPENROUTER_MODEL ?? "openai/gpt-5.3-codex", "https://openrouter.ai/api/v1/chat/completions", false, undefined, evidence) : undefined;
  let groqPacer: RequestPacer | undefined;
  const groqFileMode = environment.FORGEWEB_GROQ_FILE_MODE === 'true' || environment.FORGEWEB_BACKEND_PROVIDER === 'groq';
  if (groqKey && groqFileMode) {
    const scope = digest(groqKey + (environment.FORGEWEB_GROQ_MODEL ?? "qwen/qwen3.8-27b"));
    groqPacer = options.groqPacer ?? groqPacers.get(scope) ?? createRequestPacer();
    if (!options.groqPacer) groqPacers.set(scope, groqPacer);
  }
  const groq = groqKey ? new OpenAiCompatibleGenerationProvider("groq", groqKey, environment.FORGEWEB_GROQ_MODEL ?? "qwen/qwen3.8-27b", "https://api.groq.com/openai/v1/chat/completions", groqFileMode, groqPacer, evidence) : undefined;
  const gemini = geminiKey ? new GeminiGenerationProvider(geminiKey, environment.FORGEWEB_GEMINI_MODEL ?? "gemini-3-flash-preview", evidence) : undefined;
  if (requestedMode === "frontend-dual-gemini-backend") {
    if (!gemini || !groq || !openRouter) throw new Error("frontend-dual-gemini-backend requires Gemini, Groq and OpenRouter credentials.");
    const disabledSlots = new Set((environment.FORGEWEB_GEMINI_DISABLED_SLOTS ?? '').split(',').map((slot)=>slot.trim()).filter(Boolean));
    if ([...disabledSlots].some((slot)=>!['1','2','3'].includes(slot))) throw new Error('FORGEWEB_GEMINI_DISABLED_SLOTS accepts only 1,2,3.');
    const keys = [...new Set([geminiKey, environment.GEMINI_FALLBACK_API_KEY_1, environment.GEMINI_FALLBACK_API_KEY_2].filter((key,index): key is string => Boolean(key?.trim()) && !disabledSlots.has(String(index+1))))];
    if (!keys.length) throw new Error('At least one enabled Gemini key is required for this generation mode.');
    const geminis = keys.map((key) => new GeminiGenerationProvider(key, environment.FORGEWEB_GEMINI_MODEL ?? "gemini-3-flash-preview", evidence));
    const backendChoice = environment.FORGEWEB_BACKEND_PROVIDER ?? "gemini";
    if (!["gemini", "groq"].includes(backendChoice)) throw new Error("FORGEWEB_BACKEND_PROVIDER must be gemini or groq.");
    return new FrontendDualGeminiBackendProvider([groq, openRouter], geminis, backendChoice === "groq" ? [groq, ...geminis] : [...geminis,groq]);
  }
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
        ? "Gemini plans the product and generates its React interface and Python FastAPI backend; Groq/OpenRouter remain available as fallbacks."
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
  const qualityIssues=frontendSourceIssues(files);
  if(qualityIssues.length)throw new ApiError(422,'MODEL_FRONTEND_INTERACTIONS_INVALID',qualityIssues.join('; '));
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
  if (!/^\s*<!doctype html>/i.test(preview) || !/<(?:header|nav)[\s>]/i.test(preview) || !/<main[\s>]/i.test(preview) || !/<\/html>/i.test(preview)) throw new ApiError(422, "MODEL_PREVIEW_INVALID", "Generated preview must be a complete semantic HTML document.");
  if (!preview.toLocaleLowerCase().includes(specification.productName.toLocaleLowerCase())) throw new ApiError(422, "MODEL_PRODUCT_NAME_MISSING", "Generated preview must display the approved product name.");
  if (!/<script[\s>]/i.test(preview) || !/data-action\s*=/i.test(preview) || /href\s*=\s*["']#["']/i.test(preview)) throw new ApiError(422, "MODEL_INTERACTIONS_INVALID", "Generated preview must contain testable interactions and no dead hash links.");
  if(/<script\b[^>]*\bsrc\s*=/i.test(preview)||/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(preview))throw new ApiError(422,'MODEL_PREVIEW_EXTERNAL_DEPENDENCY','Preview must use embedded CSS and JavaScript; external runtime dependencies are blocked by the sandbox.');
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

function createApiContract(specification: MasterSpecification,files:Array<{path:string;content:string}>): { version: string; product: string; routes: Array<{ method: string; path: string }>; frontendTypes:ReturnType<typeof frontendTypes> } {
  const canonical=files.find(file=>file.path==='shared/application-schema.json');
  if(canonical){const schema=validateApplicationSchema(JSON.parse(canonical.content));return {version:'2.0',product:specification.productName,routes:schema.routes.map(({method,path})=>({method,path})),frontendTypes:frontendTypes(files)};}
  const routes = (specification.architecture.backend.routes ?? []).map((route) => {
    const match = route.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    return match ? { method: match[1].toUpperCase(), path: match[2] } : { method: "GET", path: route.trim() };
  });
  return { version: "1.1", product: specification.productName, routes,frontendTypes:frontendTypes(files) };
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

export function createFrontendSupportFiles(specification: MasterSpecification): ProviderManifest["files"] {
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
    { path: "backend/requirements.txt", content: "fastapi==0.116.1\nuvicorn[standard]==0.35.0\npydantic[email]==2.11.7\npytest==8.4.1\nhttpx==0.28.1\n", requirementIds },
    { path: "backend/app/__init__.py", content: "# Generated application package.\n", requirementIds },
    { path: "backend/app/repositories/application_repository.py", content: persistentRepository, requirementIds },
    { path: "backend/app/security/access_control.py", content: "from fastapi import HTTPException\n\ndef require_role(role: str, allowed_roles: list[str]) -> None:\n    if role not in allowed_roles: raise HTTPException(status_code=403, detail='Forbidden')\n", requirementIds },
    { path: "backend/tests/test_api.py", content: "from fastapi.testclient import TestClient\nfrom app.main import app\n\ndef test_health():\n    response = TestClient(app).get('/health')\n    assert response.status_code == 200\n", requirementIds },
  ];
}

function unique(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

export function hasLightCreamSurface(preview: string): boolean {
  const styles=[...preview.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match=>match[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
  const variables=new Map([...styles.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map(match=>[match[1],match[2]]));
  function warmLight(value:string,seen=new Set<string>()):boolean {
    const reference=value.match(/^\s*var\(\s*(--[\w-]+)\s*\)\s*$/);
    if(reference){if(seen.has(reference[1]))return false;seen.add(reference[1]);return warmLight(variables.get(reference[1])??'',seen);}
    if(/^\s*(ivory|beige|oldlace|floralwhite)\s*$/i.test(value))return true;
    const hex=value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    const rgb=value.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    const channels=hex?(hex[1].length===3?hex[1].split('').map(c=>parseInt(c+c,16)):hex[1].match(/../g)!.map(c=>parseInt(c,16))):rgb?rgb.slice(1).map(Number):undefined;
    if(!channels)return false;
    const [r,g,b]=channels;
    return r<=255&&r>=235&&g>=225&&b>=200&&r>=g&&g>=b&&r-b<=55;
  }
  const rootSurface=/(?:html|body|\.[\w-]*(?:shell|site|page|app))[^{]*\{([^}]*)\}/gi;
  return !/color-scheme\s*:\s*dark/i.test(styles)&&[...styles.matchAll(rootSurface)].some(rule=>[...rule[1].matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;}]+)/gi)].some(match=>warmLight(match[1])));
}
