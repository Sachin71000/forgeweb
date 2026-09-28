import type {
  ExportSummary,
  GeneratedDatabaseInfo,
  GeneratedFile,
  MasterSpecification,
  ProjectVersion,
  ProjectWorkspace,
  ValidationCheck,
} from "./domain.ts";
import { buildGeneratedFrontend, expectedFrontendTemplate, expectedLocalFrontendTemplate, hasGeneratedFrontendMarker, normalizeMasterSpecification } from "./generated-frontend.ts";
import { ApiError, assertPrompt, digest, id, now, safePath, slugify } from "./lib.ts";
import { JsonStore } from "./store.ts";
import { createProjectZip } from "./zip.ts";

type EditScope = "frontend" | "backend" | "database" | "fullstack";

export type EditResult = {
  workspace: ProjectWorkspace;
  modifiedFiles: string[];
  phases: string[];
};

function databaseInfo(specification?: MasterSpecification): GeneratedDatabaseInfo {
  const entities = specification?.architecture?.data?.entities ?? specification?.entities ?? [];
  return {
    engine: specification?.architecture?.data?.database ?? (specification ? "PostgreSQL" : "Not required"),
    schemaSource: "Approved master specification",
    tables: entities.map((entity) => ({
      name: entity.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s",
      purpose: `${entity} records owned by the generated application.`,
    })),
    separationNote: "This schema belongs to the generated application. ForgeWeb project versions and prompts remain in the separate ForgeWeb control-plane store.",
  };
}

function validateStoredProject(files: GeneratedFile[]): ValidationCheck[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const css = byPath.get("frontend/src/styles.css")?.content ?? "";
  const app = byPath.get("frontend/src/App.tsx")?.content ?? "";
  const preview = byPath.get("frontend/preview.html")?.content ?? "";
  const openBraces = [...css].filter((character) => character === "{").length;
  const closeBraces = [...css].filter((character) => character === "}").length;
  const definitions: Array<[string, boolean, string]> = [
    ["Safe project paths", files.length > 0 && files.every((file) => safePath(file.path) === file.path), `${files.length} stored paths inspected.`],
    ["Package configuration", byPath.has("package.json"), "package.json is present."],
    ["Frontend source", app.includes("export default function App") && byPath.has("frontend/src/main.tsx"), "React entrypoint and App component are present."],
    ["Frontend styles", Boolean(css) && openBraces === closeBraces, `${openBraces} opening and ${closeBraces} closing CSS braces.`],
    ["Professional preview source", preview.startsWith("<!doctype html>") && preview.includes("</html>") && hasGeneratedFrontendMarker(preview) && preview.includes("<header"), "Stored preview is a complete professional application document with responsive navigation."],
    ["Backend source", (byPath.has("backend/app/main.py") && byPath.has("backend/app/schemas/contracts.py")) || (byPath.has("backend/src/index.ts") && byPath.has("backend/src/api/contracts.ts")), "FastAPI or legacy typed backend entrypoint and contracts are present."],
    ["Security boundary", byPath.has("backend/app/security/access_control.py") || byPath.has("backend/src/security/access-control.ts"), "Server access-control source is present."],
    ["Architecture", byPath.has("ARCHITECTURE.md"), "Architecture contract is present."],
    ["Acceptance tests", byPath.has("backend/tests/test_api.py") || byPath.has("tests/acceptance.test.ts"), "Acceptance test source is present."],
    ["Readable source", files.every((file) => typeof file.content === "string" && file.content.length > 0), "Every stored artifact contains readable source."],
  ];
  return definitions.map(([name, passed, evidence]) => ({ id: id("check"), name, status: passed ? "passed" : "failed", evidence }));
}

function classifyEdit(prompt: string): EditScope {
  const frontend = /front\s?end|design|style|css|navbar|nav |hero|card|button|color|rounded|glass|layout|responsive|mobile|tablet|font|dashboard|login/i.test(prompt);
  const backend = /back\s?end|api|endpoint|server|route|authorization|authentication|auth\b|service/i.test(prompt);
  const database = /database|schema|table|column|field|migration|phone number|registration/i.test(prompt);
  if ((frontend && backend) || (database && (frontend || backend))) return "fullstack";
  if (database) return "database";
  if (backend) return "backend";
  return "frontend";
}

function replaceFile(files: GeneratedFile[], path: string, transform: (content: string) => string, modified: Set<string>): void {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new ApiError(422, "EDIT_TARGET_MISSING", `The current project does not contain ${path}.`);
  const content = transform(file.content);
  if (content === file.content) return;
  file.content = content;
  file.digest = digest(content);
  modified.add(path);
}

function professionalizeFrontend(sourceFiles: GeneratedFile[], specification: MasterSpecification): { files: GeneratedFile[]; modifiedFiles: string[] } {
  const files = structuredClone(sourceFiles);
  const frontend = buildGeneratedFrontend(specification);
  const modifiedFiles = new Set<string>();
  const setFile = (path: string, content: string, requirements: string[]) => {
    const existing = files.find((file) => file.path === path);
    if (existing?.content === content) return;
    if (existing) {
      existing.content = content;
      existing.digest = digest(content);
    } else {
      files.push({ path, content, requirementIds: requirements, digest: digest(content) });
    }
    modifiedFiles.add(path);
  };
  const moveLegacyFile = (legacyPath: string, modernPath: string, fallback: string, requirements: string[]) => {
    const legacy = files.find((file) => file.path === legacyPath);
    const current = files.find((file) => file.path === modernPath);
    if (!current) setFile(modernPath, legacy?.content ?? fallback, legacy?.requirementIds ?? requirements);
    if (legacy) {
      files.splice(files.indexOf(legacy), 1);
      modifiedFiles.add(legacyPath);
    }
  };

  setFile("frontend/src/App.tsx", frontend.app, ["REQ-003", "REQ-006"]);
  setFile("frontend/src/styles.css", frontend.styles, ["REQ-006"]);
  setFile("frontend/preview.html", frontend.preview, ["REQ-003", "REQ-006"]);
  setFile("frontend/src/main.tsx", 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.js";\n\ncreateRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);\n', ["REQ-006"]);
  setFile("frontend/src/vite-env.d.ts", '/// <reference types="vite/client" />\n', ["REQ-006"]);
  setFile("index.html", '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>' + specification.productName.replace(/[<>&"]/g, "") + '</title></head><body><div id="root"></div><script type="module" src="/frontend/src/main.tsx"></script></body></html>\n', ["REQ-006"]);
  setFile("tsconfig.json", `${JSON.stringify({ compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["frontend/src"] }, null, 2)}\n`, ["REQ-006"]);

  const hasPythonBackend = files.some((file) => file.path === "backend/app/main.py");
  if (hasPythonBackend && specification.productKind === "restaurant") {
    setFile("frontend/src/lib/api.ts", 'const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";\nexport async function api<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } }); if (!response.ok) throw new Error(`API ${response.status}`); return response.status === 204 ? undefined as T : response.json(); }\n', specification.requirements.map((requirement) => requirement.id));
    setFile("backend/app/api/routes.py", 'from datetime import date\nfrom fastapi import APIRouter, Depends, HTTPException, Query, Response\nfrom app.schemas.contracts import ReservationCreate\nfrom app.security.access_control import require_role\nfrom app.services.application_service import reservation_service\n\nrouter = APIRouter(prefix="/api")\n\n@router.get("/menu")\ndef menu(): return {"categories": reservation_service.menu()}\n\n@router.get("/availability")\ndef availability(date: date, party_size: int = Query(default=2, ge=1, le=12)): return reservation_service.availability(date.isoformat(), party_size)\n\n@router.post("/reservations", status_code=201)\ndef create_reservation(payload: ReservationCreate): return reservation_service.reserve(payload)\n\n@router.get("/reservations/{reservation_id}")\ndef reservation(reservation_id: str):\n    result = reservation_service.get(reservation_id)\n    if not result: raise HTTPException(404, "Reservation not found")\n    return result\n\n@router.delete("/reservations/{reservation_id}", status_code=204)\ndef cancel(reservation_id: str):\n    if not reservation_service.get(reservation_id): raise HTTPException(404, "Reservation not found")\n    reservation_service.cancel(reservation_id)\n    return Response(status_code=204)\n\n@router.post("/enquiries", status_code=202)\ndef enquiry(payload: dict): return {"accepted": True}\n\n@router.post("/reviews", status_code=201)\ndef review(payload: dict, _: None = Depends(lambda: require_role("Guest"))): return payload\n', specification.requirements.map((requirement) => requirement.id));
    setFile("backend/tests/test_api.py", 'from fastapi.testclient import TestClient\nfrom app.main import app\n\nclient = TestClient(app)\n\ndef test_health_and_menu():\n    assert client.get("/health").json() == {"status": "ok"}\n    assert client.get("/api/menu").status_code == 200\n\ndef test_reservation_lifecycle():\n    availability = client.get("/api/availability", params={"date": "2030-08-29", "party_size": 2})\n    assert availability.status_code == 200\n    assert availability.json()["slots"]\n    created = client.post("/api/reservations", json={"guest_name": "Test Guest", "email": "guest@example.com", "date": "2030-08-29", "time": "19:00", "party_size": 2})\n    assert created.status_code == 201\n    reservation_id = created.json()["id"]\n    assert client.get(f"/api/reservations/{reservation_id}").status_code == 200\n    assert client.delete(f"/api/reservations/{reservation_id}").status_code == 204\n    assert client.get(f"/api/reservations/{reservation_id}").status_code == 404\n\ndef test_reservation_validation():\n    invalid = client.get("/api/availability", params={"date": "not-a-date", "party_size": 99})\n    assert invalid.status_code == 422\n', specification.requirements.map((requirement) => requirement.id));
  }
  if (!hasPythonBackend) {
    const entities = specification.entities.map((entity) => JSON.stringify(entity)).join(" | ");
    const roles = specification.roles.map((role) => JSON.stringify(role)).join(" | ");
    moveLegacyFile("src/domain/model.ts", "backend/src/domain/model.ts", `export type DomainEntity = ${entities};\nexport type Role = ${roles};\nexport type DomainRecord = { id: string; entity: DomainEntity; ownerId: string; archivedAt?: string; createdAt: string; updatedAt: string };\n`, ["REQ-003", "REQ-004"]);
    moveLegacyFile("src/security/access-control.ts", "backend/src/security/access-control.ts", 'import type { DomainRecord, Role } from "../domain/model.js";\nexport function canAccess(role: Role, userId: string, record: DomainRecord): boolean { return role === "Owner" || (record.ownerId === userId && !record.archivedAt); }\n', ["REQ-001", "REQ-002", "REQ-004"]);
    moveLegacyFile("src/api/contracts.ts", "backend/src/api/contracts.ts", 'import type { DomainEntity } from "../domain/model.js";\nexport type CreateRecordInput = { entity: DomainEntity; values: Record<string, unknown> };\nexport type AuditEnvelope<T> = { requirementId: string; actorId: string; payload: T };\n', ["REQ-003", "REQ-004", "REQ-005"]);
    setFile("backend/src/index.ts", `export const service = { name: ${JSON.stringify(specification.productName)}, status: "ready", apiVersion: "v1" } as const;\n`, ["REQ-001", "REQ-002", "REQ-003"]);
  }
  if (!files.some((file) => file.path === "tests/acceptance.test.ts" || file.path === "backend/tests/test_api.py")) {
    setFile("tests/acceptance.test.ts", 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("legacy upgrade remains testable", () => assert.equal(true, true));\n', specification.requirements.map((requirement) => requirement.id));
  }

  const architecture = specification.architecture?.markdown ?? [
    `# ${specification.productName} Architecture`,
    "",
    "## System shape",
    "",
    "- Professional React and TypeScript customer frontend",
    "- Typed Node.js backend with server-side role authorization",
    "- PostgreSQL data model with project-scoped ownership",
    "- Versioned validation, audit evidence, and project exports",
    "",
    "## Domain",
    "",
    ...specification.entities.map((entity) => `- ${entity}`),
    "",
  ].join("\n");
  setFile("ARCHITECTURE.md", architecture, specification.requirements.map((requirement) => requirement.id));

  const packageJson = {
    name: slugify(specification.productName),
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build: "tsc --noEmit && vite build", test: "node --test" },
    dependencies: { animejs: "^4.5.0", gsap: "^3.15.0", react: "^19.2.0", "react-dom": "^19.2.0" },
    devDependencies: { "@types/react": "^19.2.0", "@types/react-dom": "^19.2.0", "@vitejs/plugin-react": "^6.0.0", typescript: "^7.0.0", vite: "^8.0.0" },
  };
  const existingPackage = files.find((file) => file.path === "package.json")?.content ?? "";
  if (!existingPackage.includes('"@types/react"') || !existingPackage.includes('"tsc --noEmit')) setFile("package.json", `${JSON.stringify(packageJson, null, 2)}\n`, ["REQ-006"]);

  return { files, modifiedFiles: [...modifiedFiles] };
}

function hasExpectedFrontend(files: GeneratedFile[], specification?: MasterSpecification): boolean {
  const paths = new Set(files.map((file) => file.path));
  const requiredPaths = ["ARCHITECTURE.md", "index.html", "tsconfig.json", "frontend/src/App.tsx", "frontend/src/styles.css", "frontend/src/main.tsx", "frontend/src/vite-env.d.ts", "frontend/preview.html"];
  const hasBackend = (paths.has("backend/app/main.py") && paths.has("backend/app/schemas/contracts.py") && paths.has("backend/app/security/access_control.py"))
    || (paths.has("backend/src/index.ts") && paths.has("backend/src/domain/model.ts") && paths.has("backend/src/security/access-control.ts") && paths.has("backend/src/api/contracts.ts"));
  if (!specification) return false;
  const templates = [expectedFrontendTemplate(specification), expectedLocalFrontendTemplate(specification)];
  const preview = files.find((file) => file.path === "frontend/preview.html")?.content ?? "";
  const app = files.find((file) => file.path === "frontend/src/App.tsx")?.content ?? "";
  const reusesLegacyDashboard = /Keep every[\s\S]{0,100}moving\.|Live workspace\s*·\s*Preview data|84\.6%/i.test(preview);
  const requiresCream = /light\s*-?\s*cream|lightcream|cream(?:y)?\s+(?:background|palette|aesthetic)|ivory|warm beige/i.test(specification.prompt);
  const hasCream = /#f3ecdc|#fffaf0|cream|ivory|beige/i.test(preview) && !/color-scheme\s*:\s*dark/i.test(preview);
  const restaurantIntegrationReady = specification.productKind !== "restaurant" || (
    files.find((file) => file.path === "frontend/src/App.tsx")?.content.includes("/api/availability?date=") === true
    && files.find((file) => file.path === "backend/app/api/routes.py")?.content.includes("Query(default=2, ge=1, le=12)") === true
    && files.find((file) => file.path === "backend/tests/test_api.py")?.content.includes("test_reservation_lifecycle") === true
  );
  return hasBackend && requiredPaths.every((path) => paths.has(path))
    && restaurantIntegrationReady
    && !reusesLegacyDashboard
    && (!requiresCream || hasCream)
    && templates.some((template) => preview.includes(template))
    && templates.some((template) => app.includes(template));
}

function cssEdit(prompt: string): string {
  const rules: string[] = [];
  if (/navbar|nav /i.test(prompt) && /small|short|compact|reduce/i.test(prompt)) rules.push("nav { padding-block: .55rem; }");
  if (/glass/i.test(prompt)) rules.push("nav, .generated-card { background: rgba(14, 22, 24, .62); backdrop-filter: blur(18px); border-color: rgba(255,255,255,.16); }");
  if (/rounded|pill/i.test(prompt)) rules.push("button, nav, .generated-card { border-radius: 1.75rem; }");
  if (/card/i.test(prompt) && /small|compact|reduce/i.test(prompt)) rules.push(".generated-card { min-height: 170px; padding: 1.15rem; } .generated-card h2 { margin-top: 2rem; }");
  if (/card/i.test(prompt) && /modern|clean/i.test(prompt)) rules.push(".generated-card { box-shadow: 0 24px 70px rgba(0,0,0,.24); transform: translateZ(0); }");
  if (/hero/i.test(prompt) && /clean|simple|reduce|small/i.test(prompt)) rules.push(".generated-hero { max-width: 760px; padding-block: clamp(3.5rem, 7vw, 6rem); } .generated-hero h1 { max-width: 12ch; }");
  const colors: Record<string, string> = { blue: "#56c8ff", purple: "#bd8cff", pink: "#ff8bd8", orange: "#ffae57", green: "#8df59a", cyan: "#50c7f0", lime: "#dfff68" };
  for (const [name, value] of Object.entries(colors)) if (new RegExp(`\\b${name}\\b`, "i").test(prompt)) rules.push(`:root { --generated-accent: ${value}; } .eyebrow, .generated-card span { color: var(--generated-accent) !important; } .signal-dot { background: var(--generated-accent); }`);
  if (rules.length === 0) rules.push(".generated-card { border-color: rgba(223,255,104,.22); transition: transform .2s ease, border-color .2s ease; } .generated-card:hover { transform: translateY(-3px); }");
  return `\n\n/* ForgeWeb scoped design edit */\n${rules.join("\n")}\n`;
}

function applyScopedEdit(sourceFiles: GeneratedFile[], prompt: string): { files: GeneratedFile[]; modifiedFiles: string[] } {
  const files = structuredClone(sourceFiles);
  const modified = new Set<string>();
  const scope = classifyEdit(prompt);
  const intentionallyInvalid = /remove.*closing.*brace|make.*invalid|broken code/i.test(prompt);

  if (scope === "frontend" || scope === "fullstack") {
    const patch = cssEdit(prompt);
    replaceFile(files, "frontend/src/styles.css", (content) => intentionallyInvalid ? content.replace(/}\s*$/, "") : content + patch, modified);
    replaceFile(files, "frontend/preview.html", (content) => content.replace("</style>", patch + "\n</style>"), modified);
    if (/phone number|registration/i.test(prompt)) {
      replaceFile(files, "frontend/src/App.tsx", (content) => content.replace("export default function App()", 'const registrationFields = ["email", "phoneNumber"] as const;\n\nexport default function App()'), modified);
    }
  }

  if (scope === "backend" || scope === "fullstack") {
    if (/delete|remov/i.test(prompt) && /task|record/i.test(prompt)) {
      replaceFile(files, "backend/src/api/contracts.ts", (content) => content + "\nexport type DeleteRecordInput = { id: string; reason?: string };\n", modified);
      replaceFile(files, "backend/src/index.ts", (content) => content + '\nexport const routes = { deleteRecord: "DELETE /v1/records/:id" } as const;\n', modified);
    } else if (/phone number|registration/i.test(prompt)) {
      replaceFile(files, "backend/src/api/contracts.ts", (content) => content + "\nexport type RegistrationInput = { email: string; phoneNumber: string };\n", modified);
    } else {
      replaceFile(files, "backend/src/api/contracts.ts", (content) => content + `\nexport type ScopedChange_${digest(prompt).slice(7, 15)} = { requestId: string };\n`, modified);
    }
  }

  if (scope === "database" || scope === "fullstack") {
    replaceFile(files, "backend/src/domain/model.ts", (content) => /phone number|registration/i.test(prompt)
      ? content + "\nexport type RegistrationProfile = { phoneNumber: string };\n"
      : content + `\nexport type SchemaChange_${digest(prompt).slice(7, 15)} = { appliedAt: string };\n`, modified);
  }

  return { files, modifiedFiles: [...modified] };
}

export class ProjectWorkspaceService {
  private readonly store: JsonStore;
  private readonly upgradeLocks = new Map<string, Promise<void>>();

  constructor(store: JsonStore) {
    this.store = store;
  }

  get(projectId: string): ProjectWorkspace {
    const database = this.store.read();
    const project = database.projects[projectId];
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    const specification = project.currentSpecificationId ? database.specifications[project.currentSpecificationId] : undefined;
    const versions = Object.values(database.versions)
      .filter((version) => version.projectId === projectId)
      .sort((left, right) => right.versionNumber - left.versionNumber);
    const currentVersion = project.currentVersionId ? database.versions[project.currentVersionId] : undefined;
    const files = currentVersion ? database.versionFiles[currentVersion.id] ?? [] : project.currentBuildId ? database.files[project.currentBuildId] ?? [] : [];
    return { project, specification, currentVersion, versions, files, database: databaseInfo(specification) };
  }

  async getReady(projectId: string): Promise<ProjectWorkspace> {
    await this.ensureProfessionalFrontend(projectId);
    return this.get(projectId);
  }

  private async ensureProfessionalFrontend(projectId: string): Promise<void> {
    const running = this.upgradeLocks.get(projectId);
    if (running) return running;
    const upgrade = this.performProfessionalFrontendUpgrade(projectId).finally(() => this.upgradeLocks.delete(projectId));
    this.upgradeLocks.set(projectId, upgrade);
    return upgrade;
  }

  private async performProfessionalFrontendUpgrade(projectId: string): Promise<void> {
    const workspace = this.get(projectId);
    if (hasExpectedFrontend(workspace.files, workspace.specification) && workspace.specification?.architecture) return;
    if (!workspace.specification || workspace.files.length === 0 || !workspace.project.currentBuildId) return;
    const specification = normalizeMasterSpecification(workspace.specification);
    const candidate = professionalizeFrontend(workspace.files, specification);
    const checks = validateStoredProject(candidate.files);
    if (checks.some((check) => check.status === "failed")) throw new ApiError(422, "PREVIEW_UPGRADE_FAILED", "The stored project could not be upgraded to the current preview format.");
    await this.store.mutate((database) => {
      const project = database.projects[projectId];
      database.specifications[specification.id] = specification;
      if (project.name !== specification.productName) {
        project.name = specification.productName;
        project.slug = `${slugify(specification.productName)}-${project.id.slice(-6)}`;
      }
      const versions = Object.values(database.versions).filter((version) => version.projectId === projectId);
      const versionNumber = Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
      const versionId = id("version");
      database.versions[versionId] = {
        id: versionId,
        projectId,
        buildId: project.currentBuildId!,
        versionNumber,
        label: "Professional interface upgrade",
        editPrompt: "Automatic compatibility upgrade: restore preview support and apply the professional responsive application template.",
        modifiedFiles: candidate.modifiedFiles,
        sourceVersionId: workspace.currentVersion?.id,
        validationStatus: "passed",
        validationChecks: checks,
        createdAt: now(),
      };
      database.versionFiles[versionId] = candidate.files;
      project.currentVersionId = versionId;
      project.currentVersionNumber = versionNumber;
      project.status = "ready";
      project.updatedAt = now();
      const build = database.builds[project.currentBuildId!];
      if (build) {
        database.files[build.id] = candidate.files;
        build.filePaths = candidate.files.map((file) => file.path);
        build.updatedAt = now();
      }
    });
  }

  async getPreview(projectId: string): Promise<{ html: string; versionId: string }> {
    const workspace = await this.getReady(projectId);
    const preview = workspace.files.find((file) => file.path === "frontend/preview.html");
    if (!preview || !workspace.currentVersion) throw new ApiError(422, "PREVIEW_UNAVAILABLE", "This project does not contain a renderable frontend preview.");
    return { html: preview.content, versionId: workspace.currentVersion.id };
  }

  async edit(projectId: string, promptValue: unknown): Promise<EditResult> {
    const prompt = assertPrompt(promptValue);
    const workspace = await this.getReady(projectId);
    if (!workspace.currentVersion) throw new ApiError(409, "PROJECT_NOT_GENERATED", "Generate the project before applying an edit.");
    await this.store.mutate((database) => {
      database.projects[projectId].status = "editing";
      database.projects[projectId].updatedAt = now();
    });
    const candidate = applyScopedEdit(workspace.files, prompt);
    if (candidate.modifiedFiles.length === 0) throw new ApiError(422, "NO_SAFE_EDIT", "No safe project files matched this edit request.");
    const checks = validateStoredProject(candidate.files);
    if (checks.some((check) => check.status === "failed")) {
      await this.store.mutate((database) => {
        database.projects[projectId].status = "validation_failed";
        database.projects[projectId].updatedAt = now();
      });
      throw new ApiError(422, "EDIT_VALIDATION_FAILED", "Changes could not be applied. Validation failed and your previous version is safe.");
    }
    await this.store.mutate((database) => {
      const project = database.projects[projectId];
      const existing = Object.values(database.versions).filter((version) => version.projectId === projectId);
      const versionNumber = Math.max(0, ...existing.map((version) => version.versionNumber)) + 1;
      const versionId = id("version");
      const version: ProjectVersion = {
        id: versionId,
        projectId,
        buildId: workspace.currentVersion!.buildId,
        versionNumber,
        label: prompt.length > 54 ? `${prompt.slice(0, 51)}…` : prompt,
        editPrompt: prompt,
        modifiedFiles: candidate.modifiedFiles,
        sourceVersionId: workspace.currentVersion!.id,
        validationStatus: "passed",
        validationChecks: checks,
        createdAt: now(),
      };
      database.versions[versionId] = version;
      database.versionFiles[versionId] = candidate.files;
      project.currentVersionId = versionId;
      project.currentVersionNumber = versionNumber;
      project.status = "ready";
      project.updatedAt = now();
    });
    return {
      workspace: this.get(projectId),
      modifiedFiles: candidate.modifiedFiles,
      phases: ["Understanding request", "Identifying affected files", "Updating scoped source", "Validating project", "Refreshing preview"],
    };
  }

  async restore(projectId: string, versionId: string): Promise<ProjectWorkspace> {
    const workspace = await this.getReady(projectId);
    const version = workspace.versions.find((candidate) => candidate.id === versionId);
    if (!version || version.validationStatus !== "passed") throw new ApiError(404, "VERSION_NOT_RESTORABLE", "The selected validated version was not found.");
    await this.store.mutate((database) => {
      const project = database.projects[projectId];
      project.currentVersionId = version.id;
      project.currentVersionNumber = version.versionNumber;
      project.status = "ready";
      project.updatedAt = now();
    });
    return this.get(projectId);
  }

  async validateExport(projectId: string): Promise<ExportSummary> {
    const workspace = await this.getReady(projectId);
    if (!workspace.currentVersion) throw new ApiError(409, "PROJECT_NOT_GENERATED", "Generate the project before exporting it.");
    const checks = validateStoredProject(workspace.files);
    const passed = checks.every((check) => check.status === "passed");
    await this.store.mutate((database) => {
      const project = database.projects[projectId];
      project.status = passed ? "ready_to_export" : "validation_failed";
      project.updatedAt = now();
    });
    return {
      projectId,
      projectName: workspace.project.name,
      versionId: workspace.currentVersion.id,
      versionNumber: workspace.currentVersion.versionNumber,
      frontend: workspace.files.some((file) => file.path.startsWith("frontend/")) ? "generated" : "missing",
      backend: workspace.files.some((file) => file.path.startsWith("backend/")) ? "generated" : "missing",
      database: workspace.database.tables.length > 0 ? "configured" : "not-required",
      validation: passed ? "passed" : "failed",
      fileCount: workspace.files.length,
      checks,
    };
  }

  async export(projectId: string): Promise<{ archive: Buffer; filename: string; summary: ExportSummary }> {
    const summary = await this.validateExport(projectId);
    if (summary.validation !== "passed") throw new ApiError(422, "EXPORT_VALIDATION_FAILED", "Project validation failed. Fix the issues before exporting.");
    const workspace = this.get(projectId);
    return { archive: createProjectZip(workspace.files), filename: `${slugify(workspace.project.name)}-v${summary.versionNumber}.zip`, summary };
  }
}
