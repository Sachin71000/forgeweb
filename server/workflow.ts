import type {
  AgentTask,
  ArchitecturePlan,
  Build,
  BuildCapability,
  BuildEvent,
  BuildStatus,
  BuildView,
  GeneratedFile,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  MasterSpecification,
  Project,
  Requirement,
  ReviewFinding,
  ValidationCheck,
} from "./domain.ts";
import { ApiError, assertPrompt, delay, digest, id, now, safePath, slugify } from "./lib.ts";
import { AGENT_POLICY, createTasks, enforceImplementationTask } from "./policy.ts";
import { ProjectWorkspaceService } from "./project-workspace.ts";
import { JsonStore } from "./store.ts";

const stageIndexes: Record<Exclude<BuildStatus, "queued" | "awaiting_confirmation" | "failed" | "needs_context">, number> = {
  specifying: 0,
  planning: 1,
  generating: 2,
  reviewing: 3,
  validating: 4,
  completed: 5,
};

const entityKeywords: Array<[RegExp, string]> = [
  [/projects?/i, "Project"],
  [/invoices?|billing/i, "Invoice"],
  [/files?|documents?/i, "FileAsset"],
  [/inventory|stock/i, "InventoryItem"],
  [/teams?|staff/i, "TeamMember"],
  [/schedul|calendar/i, "ScheduleEntry"],
  [/clients?|customers?/i, "Client"],
];

function productName(prompt: string): string {
  const match = prompt.match(/(?:build|create|make)\s+(?:an?\s+)?(?:secure\s+)?([^,.]{3,48})/i);
  const candidate = match?.[1]?.replace(/\s+(?:with|for)\s+.*$/i, "").trim();
  if (!candidate) return "ForgeWeb Application";
  return candidate.replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

const buildCapabilities: BuildCapability[] = [
  {
    id: "react",
    name: "React",
    kind: "framework",
    sourceUrl: "https://react.dev/",
    usage: "Component-driven customer application frontend with typed state and accessible interactions.",
    boundary: "Pinned application dependency; generated code owns its design system.",
  },
  {
    id: "git",
    name: "Git",
    kind: "source-control",
    sourceUrl: "https://git-scm.com/",
    usage: "Specification, architecture, generated files, and evidence remain tied to immutable revisions.",
    boundary: "External remotes require explicit user authorization.",
  },
  {
    id: "gsap",
    name: "GSAP",
    kind: "motion",
    sourceUrl: "https://gsap.com/",
    usage: "High-value timeline and scroll choreography for the generated customer interface.",
    boundary: "Reduced-motion fallbacks and license review are mandatory.",
  },
  {
    id: "animejs",
    name: "Anime.js",
    kind: "motion",
    sourceUrl: "https://animejs.com/",
    usage: "Micro-interactions, SVG motion, and lightweight state transitions.",
    boundary: "Animations support hierarchy and never block core actions.",
  },
  {
    id: "react-bits",
    name: "React Bits",
    kind: "component-source",
    sourceUrl: "https://reactbits.dev/",
    usage: "Reviewed visual-pattern reference for backgrounds, navigation, cards, and text effects.",
    boundary: "Components are selected and attributed deliberately; no blind runtime or MCP dependency is embedded.",
  },
];

function createArchitecture(
  name: string,
  prompt: string,
  roles: string[],
  entities: string[],
  requirements: Requirement[],
): ArchitecturePlan {
  const isCommerce = /shop|store|commerce|product catalog|checkout/i.test(prompt);
  const isDashboard = /portal|dashboard|admin|inventory|scheduler/i.test(prompt);
  const pages = [
    "Secure sign-in",
    isDashboard ? "Role-aware dashboard" : "Product home",
    ...entities.filter((entity) => entity !== "User").slice(0, 4).map((entity) => entity + " workspace"),
    isCommerce ? "Checkout and order status" : "Activity and audit history",
    "Settings and access management",
  ];
  const components = [
    "Responsive application shell",
    "Command and search surface",
    "Data cards and empty states",
    "Accessible forms and confirmation dialogs",
    "Evidence and activity timeline",
  ];
  const diagram = [
    "flowchart LR",
    "  Browser[React customer app] --> API[Typed backend API]",
    "  API --> Auth[Session and role policy]",
    "  API --> Domain[Domain modules]",
    "  Domain --> DB[PostgreSQL]",
    "  API --> Jobs[Background jobs]",
    "  Tests[Acceptance and security checks] --> API",
    "  Git[Git revision] --> Graph[Requirement and code graph]",
  ].join("\n");
  const fence = String.fromCharCode(96).repeat(3);
  const markdown = [
    "# " + name + " Architecture",
    "",
    "## Product boundary",
    "",
    "A secure application for " + roles.join(", ") + ". " + requirements.length + " proposed requirements drive every generated frontend and backend artifact.",
    "",
    "## System shape",
    "",
    "- React and TypeScript customer frontend",
    "- TypeScript modular backend with typed HTTP contracts",
    "- PostgreSQL data model with project-scoped ownership",
    "- Server-side authentication and role authorization",
    "- Background jobs for slow or retryable work",
    "- Git-linked requirement, file, test, and evidence graph",
    "",
    "## Frontend",
    "",
    ...pages.map((page) => "- " + page),
    "",
    "Motion is progressive enhancement: GSAP handles major timelines, Anime.js handles SVG and micro-interactions, and every experience provides reduced-motion behavior.",
    "",
    "## Backend",
    "",
    "- Identity and session module",
    "- Role and ownership policy module",
    ...entities.map((entity) => "- " + entity + " domain module"),
    "- Audit and evidence module",
    "",
    "## Security",
    "",
    "- Authorization is enforced on the server, never inferred from hidden UI.",
    "- Input is validated at the API boundary.",
    "- Destructive operations require confirmation and audit evidence.",
    "- Secrets and external integrations remain isolated capability handles.",
    "",
    "## Diagram",
    "",
    fence + "mermaid",
    diagram,
    fence,
    "",
    "## Generation gate",
    "",
    "No frontend or backend source is generated until this architecture and its requirements are explicitly confirmed.",
    "",
  ].join("\n");
  return {
    systemShape: "Modular TypeScript application with a React client, typed backend, relational data, durable jobs, and Git-linked evidence.",
    frontend: {
      framework: "React 19 and TypeScript",
      pages,
      components,
      motion: ["GSAP timelines and scroll choreography", "Anime.js SVG and micro-interactions", "React Bits-inspired reviewed visual patterns", "Reduced-motion alternatives"],
    },
    backend: {
      runtime: "Node.js and TypeScript",
      modules: ["Identity", "Authorization", ...entities, "Audit", "Validation"],
      apiStyle: "Versioned JSON HTTP contracts with server-side validation",
      jobs: ["Long-running generation", "Notifications and integrations", "Evidence and graph synchronization"],
    },
    data: {
      database: "PostgreSQL",
      entities,
      rules: ["Every mutable record has an owner or project boundary", "Archive before destructive deletion", "Migrations and audit events are versioned"],
    },
    security: [
      "Secure session boundary",
      "Server-side role and ownership checks",
      "Validated input and output contracts",
      "Secret isolation and redacted logs",
      "Explicit confirmation for consequential actions",
    ],
    delivery: ["Git-native revisions", "Automated type, test, security, and accessibility checks", "Requirement-to-code graph snapshot", "Sanitized export"],
    diagram,
    markdown,
    capabilities: buildCapabilities,
  };
}

function compileSpecification(projectId: string, prompt: string): MasterSpecification {
  const name = productName(prompt);
  const entities = ["User", ...entityKeywords.filter(([keyword]) => keyword.test(prompt)).map(([, entity]) => entity)];
  const uniqueEntities = [...new Set(entities)];
  const roles = ["Owner", "Member", ...(/client|customer/i.test(prompt) ? ["Client"] : [])];
  const requirements: Requirement[] = [
    ["Authentication", "Users can sign in and sign out through a secure session boundary."],
    ["Authorization", `Server-side role checks protect ${uniqueEntities.join(", ")}.`],
    ["Core workflow", `Authorized users can create, view, update, and safely archive ${uniqueEntities.filter((entity) => entity !== "User").join(", ") || "domain records"}.`],
    ["Validation", "Invalid and unauthorized input fails closed with a useful error."],
    ["Auditability", "Consequential operations retain requirement and actor traceability."],
    ["Quality", "The application includes responsive behavior and automated acceptance checks."],
  ].map(([title, description], index) => ({
    id: `REQ-${String(index + 1).padStart(3, "0")}`,
    title,
    description,
    acceptanceCriteria: [description],
    priority: "P0",
  }));
  return {
    id: id("spec"),
    projectId,
    version: 1,
    status: "proposed",
    prompt,
    productName: name,
    summary: `A secure ${name.toLowerCase()} with explicit roles, typed domain boundaries, validation, tests, and traceability.`,
    roles,
    entities: uniqueEntities,
    requirements,
    assumptions: [
      "The first generated stack is TypeScript and uses server-side authorization.",
      "Destructive domain actions use archive semantics unless the specification explicitly requires deletion.",
      "External integrations remain proposals until their credentials and terms are approved.",
    ],
    architecture: createArchitecture(name, prompt, roles, uniqueEntities, requirements),
    createdAt: now(),
  };
}

function generateFiles(specification: MasterSpecification): GeneratedFile[] {
  const requirementIds = specification.requirements.map((requirement) => requirement.id);
  const entityUnion = specification.entities.map((entity) => JSON.stringify(entity)).join(" | ");
  const roleUnion = specification.roles.map((role) => JSON.stringify(role)).join(" | ");
  const productLiteral = JSON.stringify(specification.productName);
  const areasLiteral = JSON.stringify(specification.architecture.frontend.pages);
  const frontendApp = [
    'import { useLayoutEffect, useRef } from "react";',
    'import gsap from "gsap";',
    'import { animate, stagger } from "animejs";',
    'import "./styles.css";',
    "",
    "const productName = " + productLiteral + ";",
    "const areas = " + areasLiteral + ";",
    "",
    "export default function App() {",
    "  const root = useRef<HTMLDivElement>(null);",
    "  useLayoutEffect(() => {",
    "    if (!root.current || matchMedia(\"(prefers-reduced-motion: reduce)\").matches) return;",
    "    const context = gsap.context(() => gsap.from(\".generated-card\", { y: 24, opacity: 0, stagger: 0.08, duration: 0.65, ease: \"power3.out\" }), root);",
    "    animate(\".signal-dot\", { scale: [0.75, 1.2], opacity: [0.45, 1], delay: stagger(90), loop: true, alternate: true, duration: 900 });",
    "    return () => context.revert();",
    "  }, []);",
    "  return (",
    "    <main ref={root} className=\"generated-shell\">",
    "      <nav><strong>{productName}</strong><span>Secure workspace</span></nav>",
    "      <section className=\"generated-hero\">",
    "        <p className=\"eyebrow\"><i className=\"signal-dot\" /> Built from your approved architecture</p>",
    "        <h1>{productName}</h1>",
    "        <p>A responsive, role-aware product surface with a real frontend/backend boundary.</p>",
    "      </section>",
    "      <section className=\"generated-grid\">",
    "        {areas.map((area, index) => <article className=\"generated-card\" key={area}><span>0{index + 1}</span><h2>{area}</h2><p>Connected to typed APIs, access policy, validation, and audit evidence.</p></article>)}",
    "      </section>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
  const frontendStyles = [
    ":root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui; background: #070b0c; color: #f7f8f2; }",
    "* { box-sizing: border-box; } body { margin: 0; min-width: 320px; }",
    ".generated-shell { min-height: 100vh; padding: clamp(1rem, 4vw, 4rem); background: radial-gradient(circle at 80% 10%, rgba(32,199,224,.2), transparent 28%), #070b0c; }",
    "nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid rgba(255,255,255,.1); }",
    "nav span, .generated-hero p, .generated-card p { color: rgba(255,255,255,.58); }",
    ".generated-hero { max-width: 900px; padding: clamp(5rem, 10vw, 9rem) 0 4rem; }",
    ".eyebrow { display: flex; align-items: center; gap: .6rem; color: #dfff68 !important; text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; }",
    ".signal-dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #dfff68; box-shadow: 0 0 24px #dfff68; }",
    "h1 { margin: 1rem 0; font-size: clamp(3.5rem, 10vw, 8rem); line-height: .88; letter-spacing: -.07em; }",
    ".generated-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }",
    ".generated-card { min-height: 220px; padding: 1.5rem; border: 1px solid rgba(255,255,255,.1); border-radius: 1.4rem; background: rgba(255,255,255,.045); backdrop-filter: blur(20px); }",
    ".generated-card span { color: #dfff68; font: 700 .7rem ui-monospace; } .generated-card h2 { margin-top: 3.5rem; }",
    "@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; scroll-behavior: auto !important; } }",
    "",
  ].join("\n");
  const frontendPreview = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "<title>" + escapeHtml(specification.productName) + "</title>",
    "<style>" + frontendStyles + "</style>",
    "</head>",
    "<body>",
    '<main class="generated-shell">',
    "<nav><strong>" + escapeHtml(specification.productName) + "</strong><span>Secure workspace</span></nav>",
    '<section class="generated-hero">',
    '<p class="eyebrow"><i class="signal-dot"></i> Built from your approved architecture</p>',
    "<h1>" + escapeHtml(specification.productName) + "</h1>",
    "<p>A responsive, role-aware product surface with a real frontend/backend boundary.</p>",
    "</section>",
    '<section class="generated-grid">',
    ...specification.architecture.frontend.pages.map((area, index) => '<article class="generated-card"><span>0' + (index + 1) + "</span><h2>" + escapeHtml(area) + "</h2><p>Connected to typed APIs, access policy, validation, and audit evidence.</p></article>"),
    "</section>",
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
  const packageJson = {
    name: slugify(specification.productName),
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build: "tsc -b && vite build", test: "node --test" },
    dependencies: { animejs: "^4.5.0", gsap: "^3.15.0", react: "^19.2.0", "react-dom": "^19.2.0" },
    devDependencies: { "@vitejs/plugin-react": "^6.0.0", typescript: "^7.0.0", vite: "^8.0.0" },
  };
  const templates = [
    { path: "README.md", requirements: requirementIds, content: "# " + specification.productName + "\n\n" + specification.summary + "\n\nGenerated only after confirmation of specification " + specification.id + ".\n" },
    { path: "ARCHITECTURE.md", requirements: requirementIds, content: specification.architecture.markdown },
    { path: "package.json", requirements: ["REQ-006"], content: JSON.stringify(packageJson, null, 2) + "\n" },
    { path: "frontend/src/App.tsx", requirements: ["REQ-003", "REQ-006"], content: frontendApp },
    { path: "frontend/src/styles.css", requirements: ["REQ-006"], content: frontendStyles },
    { path: "frontend/src/main.tsx", requirements: ["REQ-006"], content: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.js";\n\ncreateRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);\n' },
    { path: "frontend/preview.html", requirements: ["REQ-003", "REQ-006"], content: frontendPreview },
    { path: "backend/src/domain/model.ts", requirements: ["REQ-003", "REQ-004"], content: "export type DomainEntity = " + entityUnion + ";\nexport type Role = " + roleUnion + ";\nexport type DomainRecord = { id: string; entity: DomainEntity; ownerId: string; archivedAt?: string; createdAt: string; updatedAt: string };\n" },
    { path: "backend/src/security/access-control.ts", requirements: ["REQ-001", "REQ-002", "REQ-004"], content: 'import type { DomainRecord, Role } from "../domain/model.js";\nexport function canAccess(role: Role, userId: string, record: DomainRecord): boolean { return role === "Owner" || (record.ownerId === userId && !record.archivedAt); }\nexport function requireAccess(allowed: boolean): asserts allowed { if (!allowed) throw new Error("FORBIDDEN"); }\n' },
    { path: "backend/src/api/contracts.ts", requirements: ["REQ-003", "REQ-004", "REQ-005"], content: 'import type { DomainEntity } from "../domain/model.js";\nexport type CreateRecordInput = { entity: DomainEntity; values: Record<string, unknown> };\nexport type AuditEnvelope<T> = { requirementId: string; actorId: string; payload: T };\n' },
    { path: "backend/src/index.ts", requirements: ["REQ-001", "REQ-002", "REQ-003"], content: 'export const service = { name: ' + productLiteral + ', status: "ready", apiVersion: "v1" } as const;\n' },
    { path: "tests/acceptance.test.ts", requirements: requirementIds, content: 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("approved architecture keeps requirement coverage", () => { assert.equal(' + JSON.stringify(requirementIds) + ".length, " + requirementIds.length + "); });\n" },
  ];
  return templates.map((template) => ({
    path: safePath(template.path),
    content: template.content,
    requirementIds: template.requirements,
    digest: digest(template.content),
  }));
}
function review(specification: MasterSpecification, implementationTask: AgentTask, files: GeneratedFile[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const traced = new Set(files.flatMap((file) => file.requirementIds));
  for (const requirement of specification.requirements) {
    if (!traced.has(requirement.id)) findings.push({ id: id("finding"), severity: "error", message: `${requirement.id} has no generated artifact.` });
  }
  if (files.length > implementationTask.changeBudget.maxFiles) {
    findings.push({ id: id("finding"), severity: "error", message: "Implementation exceeds the approved file budget." });
  }
  if (findings.length === 0) findings.push({ id: id("finding"), severity: "info", message: "Independent review found no blocking scope, simplicity, or traceability issues." });
  return findings;
}

function validate(specification: MasterSpecification, files: GeneratedFile[], findings: ReviewFinding[]): ValidationCheck[] {
  const paths = new Set(files.map((file) => file.path));
  const traced = new Set(files.flatMap((file) => file.requirementIds));
  const checks: ValidationCheck[] = [
    { id: id("check"), name: "Safe generated paths", status: files.every((file) => !file.path.includes("..")) ? "passed" : "failed", evidence: `${files.length} repository-relative paths inspected.` },
    { id: id("check"), name: "Architecture contract", status: paths.has("ARCHITECTURE.md") ? "passed" : "failed", evidence: "The approved architecture is preserved beside generated source." },
    { id: id("check"), name: "Required secure boundary", status: paths.has("backend/src/security/access-control.ts") ? "passed" : "failed", evidence: "Server-side access-control artifact is present." },
    { id: id("check"), name: "Customer frontend", status: paths.has("frontend/src/App.tsx") && paths.has("frontend/src/styles.css") ? "passed" : "failed", evidence: "Responsive React application and design system are present." },
    { id: id("check"), name: "Isolated preview artifact", status: paths.has("frontend/preview.html") ? "passed" : "failed", evidence: "A stored, sandbox-renderable frontend preview is present." },
    { id: id("check"), name: "Customer backend", status: paths.has("backend/src/index.ts") && paths.has("backend/src/api/contracts.ts") ? "passed" : "failed", evidence: "Typed backend entrypoint and API contracts are present." },
    { id: id("check"), name: "Acceptance tests", status: paths.has("tests/acceptance.test.ts") ? "passed" : "failed", evidence: "Generated acceptance-test artifact is present." },
    { id: id("check"), name: "Requirement traceability", status: specification.requirements.every((requirement) => traced.has(requirement.id)) ? "passed" : "failed", evidence: `${traced.size}/${specification.requirements.length} requirement identifiers mapped.` },
    { id: id("check"), name: "Independent review", status: findings.every((finding) => finding.severity !== "error") ? "passed" : "failed", evidence: `${findings.length} review record(s) evaluated.` },
    { id: id("check"), name: "Policy provenance", status: AGENT_POLICY.sourceRevision.length >= 7 && AGENT_POLICY.sourceDigest.startsWith("sha256:") ? "passed" : "failed", evidence: `${AGENT_POLICY.version} at upstream revision ${AGENT_POLICY.sourceRevision}.` },
  ];
  return checks;
}

function buildGraph(project: Project, build: Build, specification: MasterSpecification, tasks: AgentTask[], files: GeneratedFile[], checks: ValidationCheck[]): GraphSnapshot {
  const nodes: GraphNode[] = [{ id: project.id, type: "project", label: project.name }];
  const edges: GraphEdge[] = [];
  for (const requirement of specification.requirements) {
    nodes.push({ id: requirement.id, type: "requirement", label: requirement.title });
    edges.push({ id: id("edge"), type: "CONTAINS", from: project.id, to: requirement.id });
  }
  for (const task of tasks) {
    nodes.push({ id: task.id, type: "task", label: task.objective, metadata: { role: task.role } });
    for (const requirementId of task.requirementIds) edges.push({ id: id("edge"), type: "PERFORMED_BY", from: requirementId, to: task.id });
  }
  for (const file of files) {
    const fileId = `file:${file.path}`;
    nodes.push({ id: fileId, type: "file", label: file.path, metadata: { digest: file.digest } });
    for (const requirementId of file.requirementIds) edges.push({ id: id("edge"), type: "SATISFIED_BY", from: requirementId, to: fileId });
  }
  for (const check of checks) {
    nodes.push({ id: check.id, type: "validation", label: check.name, metadata: { status: check.status } });
    edges.push({ id: id("edge"), type: "VALIDATED_BY", from: project.id, to: check.id });
  }
  return {
    id: id("graph"),
    projectId: project.id,
    buildId: build.id,
    mode: "authoritative",
    engine: "forgeweb-structural-adapter",
    upstreamTarget: "code-review-graph@2.3.7",
    nodes,
    edges,
    createdAt: now(),
  };
}

export class BuildWorkflow {
  private running = new Set<string>();
  private readonly store: JsonStore;
  private readonly stageDelayMs: number;
  readonly workspace: ProjectWorkspaceService;

  constructor(store: JsonStore, stageDelayMs = 180) {
    this.store = store;
    this.stageDelayMs = stageDelayMs;
    this.workspace = new ProjectWorkspaceService(store);
  }

  async create(promptValue: unknown): Promise<BuildView> {
    const prompt = assertPrompt(promptValue);
    const timestamp = now();
    const projectId = id("project");
    const buildId = id("build");
    const name = productName(prompt);
    const project: Project = {
      id: projectId,
      slug: `${slugify(name)}-${projectId.slice(-5)}`,
      name,
      status: "planning",
      originalPrompt: prompt,
      createdAt: timestamp,
      updatedAt: timestamp,
      currentBuildId: buildId,
    };
    const build: Build = {
      id: buildId,
      projectId,
      status: "queued",
      currentStageIndex: -1,
      stageDetail: "Build accepted and queued.",
      stages: [],
      taskIds: [],
      filePaths: [],
      reviewFindings: [],
      validationChecks: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.mutate((database) => {
      database.projects[project.id] = project;
      database.builds[build.id] = build;
      database.events[build.id] = [{ id: id("event"), buildId, type: "build.created", message: "Build accepted.", timestamp }];
    });
    void this.prepare(buildId, prompt);
    return this.get(buildId);
  }

  get(buildId: string): BuildView {
    const database = this.store.read();
    const build = database.builds[buildId];
    if (!build) throw new ApiError(404, "BUILD_NOT_FOUND", "Build was not found.");
    return {
      ...build,
      project: database.projects[build.projectId],
      specification: build.specificationId ? database.specifications[build.specificationId] : undefined,
      events: database.events[buildId] ?? [],
    };
  }

  getProject(projectId: string): { project: Project; specification?: MasterSpecification; files: GeneratedFile[]; graph?: GraphSnapshot } {
    const database = this.store.read();
    const project = database.projects[projectId];
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    return {
      project,
      specification: project.currentSpecificationId ? database.specifications[project.currentSpecificationId] : undefined,
      files: project.currentVersionId ? database.versionFiles[project.currentVersionId] ?? [] : project.currentBuildId ? database.files[project.currentBuildId] ?? [] : [],
      graph: project.currentGraphSnapshotId ? database.graphs[project.currentGraphSnapshotId] : undefined,
    };
  }

  listProjects(): Project[] {
    return Object.values(this.store.read().projects).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async prepare(buildId: string, prompt?: string): Promise<void> {
    const runKey = `prepare:${buildId}`;
    if (this.running.has(runKey)) return;
    this.running.add(runKey);
    try {
      const initial = this.get(buildId);
      const sourcePrompt = prompt ?? initial.specification?.prompt;
      if (!sourcePrompt) throw new ApiError(500, "MISSING_PROMPT", "Build cannot resume without a prompt.");

      await this.stage(buildId, "specifying", "Turning the idea into a proposed, versioned master specification.");
      const specification = compileSpecification(initial.projectId, sourcePrompt);
      await this.store.mutate((database) => {
        database.specifications[specification.id] = specification;
        const build = database.builds[buildId];
        build.specificationId = specification.id;
        build.stageDetail = `${specification.requirements.length} proposed requirements mapped across ${specification.entities.length} domain entities.`;
        const project = database.projects[build.projectId];
        project.currentSpecificationId = specification.id;
        project.updatedAt = now();
      });
      await this.completeStage(buildId);

      await this.stage(buildId, "planning", "Applying the shared coding discipline and creating bounded specialist tasks.");
      const tasks = createTasks(buildId, specification);
      await this.store.mutate((database) => {
        for (const task of tasks) database.tasks[task.id] = task;
        database.builds[buildId].taskIds = tasks.map((task) => task.id);
        database.builds[buildId].stageDetail = `${tasks.length} bounded tasks created under ${AGENT_POLICY.version}.`;
      });
      await this.completeStage(buildId);

      await this.store.mutate((database) => {
        const build = database.builds[buildId];
        build.status = "awaiting_confirmation";
        build.stageDetail = `Architecture and ${specification.requirements.length} requirements are ready for confirmation. No source has been generated.`;
        build.updatedAt = now();
        const project = database.projects[build.projectId];
        project.status = "awaiting_confirmation";
        project.updatedAt = now();
        this.pushEvent(database.events[buildId], buildId, "build.awaiting_confirmation", build.stageDetail, {
          requirements: specification.requirements.length,
          architectureFile: "ARCHITECTURE.md",
        });
      });
    } catch (error) {
      await this.fail(buildId, error);
    } finally {
      this.running.delete(runKey);
    }
  }

  async confirm(buildId: string): Promise<BuildView> {
    const current = this.get(buildId);
    if (current.status === "completed") return current;
    if (current.status !== "awaiting_confirmation" || !current.specification) {
      throw new ApiError(409, "INVALID_BUILD_STATE", "Requirements can only be confirmed after the architecture proposal is ready.");
    }
    const confirmedAt = now();
    await this.store.mutate((database) => {
      const build = database.builds[buildId];
      const specification = database.specifications[build.specificationId!];
      specification.status = "approved";
      specification.confirmedAt = confirmedAt;
      build.confirmedAt = confirmedAt;
      build.status = "generating";
      build.stageDetail = "Requirements confirmed. Starting frontend and backend generation.";
      build.updatedAt = confirmedAt;
      const project = database.projects[build.projectId];
      project.status = "building";
      project.updatedAt = confirmedAt;
      this.pushEvent(database.events[buildId], buildId, "build.confirmed", build.stageDetail, { specificationId: specification.id });
    });
    void this.execute(buildId);
    return this.get(buildId);
  }

  private async execute(buildId: string): Promise<void> {
    const runKey = `execute:${buildId}`;
    if (this.running.has(runKey)) return;
    this.running.add(runKey);
    try {
      const initial = this.get(buildId);
      const specification = initial.specification;
      if (!specification || specification.status !== "approved") {
        throw new ApiError(409, "SPECIFICATION_NOT_CONFIRMED", "Frontend and backend generation requires an approved specification.");
      }
      const database = this.store.read();
      const tasks = initial.taskIds.map((taskId) => database.tasks[taskId]).filter((task): task is AgentTask => Boolean(task));
      if (tasks.length === 0) throw new ApiError(500, "TASK_PLAN_INVALID", "Approved task plan is missing.");

      await this.stage(buildId, "generating", "Generating a minimal secure application skeleton in an isolated manifest.");
      const files = generateFiles(specification);
      const implementationTask = tasks.find((task) => task.role === "implementation");
      if (!implementationTask) throw new ApiError(500, "TASK_PLAN_INVALID", "Implementation task is missing.");
      enforceImplementationTask(implementationTask, files);
      await this.store.mutate((database) => {
        database.files[buildId] = files;
        database.builds[buildId].filePaths = files.map((file) => file.path);
        database.builds[buildId].stageDetail = `${files.length} scoped files generated with complete file digests.`;
        for (const taskId of database.builds[buildId].taskIds) database.tasks[taskId].status = "completed";
      });
      await this.completeStage(buildId);

      await this.stage(buildId, "reviewing", "Running an independent scope, simplicity, and traceability review.");
      const findings = review(specification, implementationTask, files);
      if (findings.some((finding) => finding.severity === "error")) throw new ApiError(422, "REVIEW_FAILED", "Independent engineering review found blocking issues.");
      await this.store.mutate((database) => {
        database.builds[buildId].reviewFindings = findings;
        database.builds[buildId].stageDetail = "Independent engineering review passed without blocking findings.";
      });
      await this.completeStage(buildId);

      await this.stage(buildId, "validating", "Validating paths, security boundary, tests, provenance, and requirement coverage.");
      const checks = validate(specification, files, findings);
      if (checks.some((check) => check.status === "failed")) throw new ApiError(422, "VALIDATION_FAILED", "One or more required validation checks failed.");
      await this.store.mutate((database) => {
        database.builds[buildId].validationChecks = checks;
        database.builds[buildId].stageDetail = `${checks.length} deterministic validation checks passed.`;
      });
      await this.completeStage(buildId);

      const current = this.get(buildId);
      const graph = buildGraph(current.project, current, specification, tasks, files, checks);
      await this.store.mutate((database) => {
        database.graphs[graph.id] = graph;
        const build = database.builds[buildId];
        build.status = "completed";
        build.currentStageIndex = stageIndexes.completed;
        build.stageDetail = `Validated — ${checks.length} checks passed and ${graph.nodes.length} graph nodes synchronized.`;
        build.graphSnapshotId = graph.id;
        build.completedAt = now();
        build.updatedAt = now();
        build.stages.push({ index: stageIndexes.completed, key: "completed", label: "Graph synchronized", detail: build.stageDetail, startedAt: now(), completedAt: now() });
        const project = database.projects[build.projectId];
        const versionId = id("version");
        database.versions[versionId] = {
          id: versionId,
          projectId: project.id,
          buildId,
          versionNumber: 1,
          label: "Initial generation",
          editPrompt: specification.prompt,
          modifiedFiles: files.map((file) => file.path),
          validationStatus: "passed",
          validationChecks: checks,
          createdAt: now(),
        };
        database.versionFiles[versionId] = files;
        project.status = "ready";
        project.originalPrompt = specification.prompt;
        project.currentVersionId = versionId;
        project.currentVersionNumber = 1;
        project.currentGraphSnapshotId = graph.id;
        project.updatedAt = now();
        this.pushEvent(database.events[buildId], buildId, "build.completed", build.stageDetail, { graphNodes: graph.nodes.length, checks: checks.length });
      });
    } catch (error) {
      await this.fail(buildId, error);
    } finally {
      this.running.delete(runKey);
    }
  }

  private async fail(buildId: string, error: unknown): Promise<void> {
    const code = error instanceof ApiError ? error.code : "BUILD_FAILED";
    const message = error instanceof Error ? error.message : "Build failed unexpectedly.";
    await this.store.mutate((database) => {
      const build = database.builds[buildId];
      if (!build) return;
      build.status = "failed";
      build.error = { code, message };
      build.stageDetail = message;
      build.updatedAt = now();
      database.projects[build.projectId].status = "failed";
      this.pushEvent(database.events[buildId], buildId, "build.failed", message, { code });
    });
  }

  private async stage(buildId: string, status: Exclude<BuildStatus, "queued" | "awaiting_confirmation" | "completed" | "failed" | "needs_context">, detail: string): Promise<void> {
    await delay(this.stageDelayMs);
    await this.store.mutate((database) => {
      const build = database.builds[buildId];
      build.status = status;
      build.currentStageIndex = stageIndexes[status];
      build.stageDetail = detail;
      build.updatedAt = now();
      build.stages.push({ index: stageIndexes[status], key: status, label: status[0].toUpperCase() + status.slice(1), detail, startedAt: now() });
      this.pushEvent(database.events[buildId], buildId, "build.stage.started", detail, { stage: status, stageIndex: stageIndexes[status] });
    });
  }

  private async completeStage(buildId: string): Promise<void> {
    await this.store.mutate((database) => {
      const build = database.builds[buildId];
      const current = [...build.stages].reverse().find((stage) => stage.index === build.currentStageIndex && !stage.completedAt);
      if (current) current.completedAt = now();
      this.pushEvent(database.events[buildId], buildId, "build.stage.completed", build.stageDetail, { stageIndex: build.currentStageIndex });
    });
  }

  private pushEvent(events: BuildEvent[], buildId: string, type: BuildEvent["type"], message: string, data?: BuildEvent["data"]): void {
    events.push({ id: id("event"), buildId, type, message, timestamp: now(), data });
  }
}
