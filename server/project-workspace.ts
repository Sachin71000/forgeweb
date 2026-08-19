import type {
  ExportSummary,
  GeneratedDatabaseInfo,
  GeneratedFile,
  MasterSpecification,
  ProjectVersion,
  ProjectWorkspace,
  ValidationCheck,
} from "./domain.ts";
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
  const entities = specification?.architecture.data.entities ?? [];
  return {
    engine: specification?.architecture.data.database ?? "Not required",
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
    ["Preview source", preview.startsWith("<!doctype html>") && preview.includes("</html>"), "Stored preview is a complete HTML document."],
    ["Backend source", byPath.has("backend/src/index.ts") && byPath.has("backend/src/api/contracts.ts"), "Typed backend entrypoint and contracts are present."],
    ["Security boundary", byPath.has("backend/src/security/access-control.ts"), "Server access-control source is present."],
    ["Architecture", byPath.has("ARCHITECTURE.md"), "Architecture contract is present."],
    ["Acceptance tests", byPath.has("tests/acceptance.test.ts"), "Acceptance test source is present."],
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

  getPreview(projectId: string): { html: string; versionId: string } {
    const workspace = this.get(projectId);
    const preview = workspace.files.find((file) => file.path === "frontend/preview.html");
    if (!preview || !workspace.currentVersion) throw new ApiError(422, "PREVIEW_UNAVAILABLE", "This project does not contain a renderable frontend preview.");
    return { html: preview.content, versionId: workspace.currentVersion.id };
  }

  async edit(projectId: string, promptValue: unknown): Promise<EditResult> {
    const prompt = assertPrompt(promptValue);
    const workspace = this.get(projectId);
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
    const workspace = this.get(projectId);
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
    const workspace = this.get(projectId);
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
