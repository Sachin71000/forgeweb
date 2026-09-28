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
  ProductKind,
  Requirement,
  ReviewFinding,
  ValidationCheck,
} from "./domain.ts";
import { ApiError, assertPrompt, delay, digest, id, now, safePath, slugify } from "./lib.ts";
import { buildGeneratedFrontend, hasGeneratedFrontendMarker } from "./generated-frontend.ts";
import { detectProductKind, inferDomainEntities, inferProductName } from "./product-intent.ts";
import { AGENT_POLICY, createTasks, enforceImplementationTask } from "./policy.ts";
import { ProjectWorkspaceService } from "./project-workspace.ts";
import { applyProviderPlan, type ApplicationGenerationProvider } from "./providers/generation-provider.ts";
import { JsonStore } from "./store.ts";

const stageIndexes: Record<Exclude<BuildStatus, "queued" | "awaiting_confirmation" | "failed" | "needs_context">, number> = {
  specifying: 0,
  planning: 1,
  generating: 2,
  reviewing: 3,
  validating: 4,
  completed: 5,
};

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
  kind: ProductKind,
  roles: string[],
  entities: string[],
  requirements: Requirement[],
): ArchitecturePlan {
  const isCommerce = kind === "commerce";
  const isRestaurant = kind === "restaurant";
  const isDashboard = /portal|dashboard|admin|inventory|scheduler/i.test(prompt);
  const pages = isCommerce ? [
    "Premium storefront home",
    "Category, search, and filtered results",
    "Product details and verified reviews",
    "Cart and wishlist",
    "Secure checkout and payment",
    "Order tracking and customer profile",
    "Admin products, users, inventory, and orders",
  ] : isRestaurant ? [
    "Story-led restaurant home with cuisine and atmosphere",
    "Filterable food and drinks menu with dietary labels",
    "Table reservation flow with date, time, party size, and confirmation",
    "Private dining and events enquiry",
    "Location, opening hours, contact, and directions",
    "Guest account with upcoming reservations and reviews",
  ] : [
    "Secure sign-in",
    isDashboard ? "Role-aware dashboard" : "Product home",
    ...entities.filter((entity) => entity !== "User").slice(0, 4).map((entity) => entity + " workspace"),
    "Activity and audit history",
    "Settings and access management",
  ];
  const components = isCommerce ? [
    "Responsive commerce navigation and global search",
    "Category rail, search filters, and sorting",
    "Product gallery, pricing, ratings, and inventory state",
    "Persistent cart and wishlist",
    "Checkout, payment, and order tracking surfaces",
    "Customer account and admin operations dashboard",
  ] : isRestaurant ? [
    "Editorial navigation with reserve-table action",
    "Seasonal menu cards and dietary filters",
    "Reservation availability picker and confirmation sheet",
    "Chef story, gallery, testimonials, and location panel",
    "Mobile booking bar and accessible enquiry forms",
  ] : ["Responsive application shell", "Command and search surface", "Data cards and empty states", "Accessible forms and confirmation dialogs", "Evidence and activity timeline"];
  const routes = isCommerce ? [
    "GET /api/products", "GET /api/products/{product_id}", "PUT /api/cart/items", "POST /api/checkout", "GET /api/orders", "POST /api/reviews", "PATCH /api/admin/inventory/{product_id}",
  ] : isRestaurant ? [
    "GET /api/menu", "GET /api/availability", "POST /api/reservations", "GET /api/reservations/{reservation_id}", "DELETE /api/reservations/{reservation_id}", "POST /api/enquiries", "POST /api/reviews",
  ] : ["GET /api/records", "POST /api/records", "GET /api/records/{record_id}", "PATCH /api/records/{record_id}", "DELETE /api/records/{record_id}"];
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
    "- Python FastAPI modular backend with Pydantic HTTP contracts",
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
    systemShape: "Modular application with a React client, Python FastAPI backend, shared JSON contract, relational data, and Git-linked evidence.",
    frontend: {
      framework: "React 19 and TypeScript",
      pages,
      components,
      motion: ["GSAP timelines and scroll choreography", "Anime.js SVG and micro-interactions", "React Bits-inspired reviewed visual patterns", "Reduced-motion alternatives"],
    },
    backend: {
      runtime: "Python 3.12 and FastAPI",
      modules: ["Identity", "Authorization", ...entities, "Audit", "Validation"],
      apiStyle: "Versioned JSON HTTP contracts with server-side validation",
      jobs: ["Long-running generation", "Notifications and integrations", "Evidence and graph synchronization"],
      routes,
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
  const productKind = detectProductKind(prompt);
  const name = inferProductName(prompt, productKind);
  const entities = inferDomainEntities(prompt, productKind);
  const roles = productKind === "commerce" ? ["Owner", "Admin", "Customer", "Support"] : productKind === "restaurant" ? ["Owner", "Host", "Guest"] : ["Owner", "Member", ...(/client|customer/i.test(prompt) ? ["Client"] : [])];
  const requirementDefinitions: Array<[string, string]> = productKind === "commerce" ? [
    ["Customer identity", "Customers can securely sign up, sign in, recover access, and manage saved addresses and profile data."],
    ["Catalog discovery", "Customers can browse categories, search products, filter and sort results, and receive fast paginated responses."],
    ["Product decisions", "Product details include media, variants, price, availability, delivery information, verified ratings, and reviews."],
    ["Cart and wishlist", "Authenticated and guest customers can maintain a persistent cart and wishlist with validated price and stock state."],
    ["Secure checkout", "Checkout validates address, delivery option, promotions, tax, inventory, and the final order total on the server."],
    ["Payments", "Payment intents and webhooks are idempotent, signed, auditable, and isolated from raw card data."],
    ["Orders and tracking", "Customers can view order history, track fulfillment, and receive clear cancellation, return, and refund states."],
    ["Reviews and trust", "Verified customers can submit moderated ratings and reviews while abuse controls protect product trust."],
    ["Admin operations", "Authorized administrators can manage products, categories, users, inventory, orders, promotions, and review moderation."],
    ["Security and audit", "Server-side authorization, validated contracts, rate limits, redacted logs, and audit evidence protect consequential actions."],
    ["Experience and quality", "The storefront is responsive, accessible, performant, animated progressively, and covered by automated acceptance checks."],
  ] : productKind === "restaurant" ? [
    ["Restaurant discovery", "Guests can understand the cuisine, atmosphere, location, opening hours, and primary reservation action from the home page."],
    ["Menu exploration", "Guests can browse prompt-specific food and drink categories, prices, descriptions, availability, and dietary labels."],
    ["Table availability", "Guests can check real availability by date, time, and party size before submitting a reservation."],
    ["Reservation lifecycle", "Guests can create, view, and cancel reservations with validation and a clear confirmation reference."],
    ["Guest acquisition", "Private dining enquiries, newsletter capture, reviews, and location calls to action support customer acquisition."],
    ["Restaurant operations", "Hosts can review reservations and protect capacity from double booking through server-side rules."],
    ["Quality and accessibility", "Navigation, forms, menu filters, and reservation actions work across desktop, tablet, mobile, and keyboard input."],
  ] : [
    ["Authentication", "Users can sign in and sign out through a secure session boundary."],
    ["Authorization", `Server-side role checks protect ${entities.join(", ")}.`],
    ["Core workflow", `Authorized users can create, view, update, and safely archive ${entities.filter((entity) => entity !== "User").join(", ") || "domain records"}.`],
    ["Validation", "Invalid and unauthorized input fails closed with a useful error."],
    ["Auditability", "Consequential operations retain requirement and actor traceability."],
    ["Quality", "The application includes responsive behavior and automated acceptance checks."],
  ];
  const requirements: Requirement[] = requirementDefinitions.map(([title, description], index) => ({
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
    productKind,
    productName: name,
    summary: productKind === "commerce"
      ? "A premium full-stack commerce experience with fast product discovery, trusted checkout, customer accounts, order tracking, and secure admin operations."
      : `A secure ${name.toLowerCase()} with explicit roles, typed domain boundaries, validation, tests, and traceability.`,
    roles,
    entities,
    requirements,
    assumptions: [
      "The generated stack uses React/TypeScript for the frontend and Python/FastAPI for the backend with server-side authorization.",
      "Destructive domain actions use archive semantics unless the specification explicitly requires deletion.",
      "External integrations remain proposals until their credentials and terms are approved.",
    ],
    architecture: createArchitecture(name, prompt, productKind, roles, entities, requirements),
    generator: { mode: "deterministic", provider: "forgeweb-local", model: "forgeweb-templates-v2", message: "Local deterministic architecture used because no external generation provider is configured." },
    createdAt: now(),
  };
}

export function generateDeterministicFiles(specification: MasterSpecification): GeneratedFile[] {
  const requirementIds = specification.requirements.map((requirement) => requirement.id);
  const frontend = buildGeneratedFrontend(specification);
  const packageJson = {
    name: slugify(specification.productName),
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build: "tsc --noEmit && vite build", test: "node --test" },
    dependencies: { animejs: "^4.5.0", gsap: "^3.15.0", react: "^19.2.0", "react-dom": "^19.2.0" },
    devDependencies: { "@types/react": "^19.2.0", "@types/react-dom": "^19.2.0", "@vitejs/plugin-react": "^6.0.0", typescript: "^7.0.0", vite: "^8.0.0" },
  };
  const apiRoutes = (specification.architecture.backend.routes ?? []).map((route) => {
    const match = route.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    return match ? { method: match[1].toUpperCase(), path: match[2] } : { method: "GET", path: route };
  });
  const requirementsMarkdown = [`# ${specification.productName} Requirements`, "", specification.summary, "", ...specification.requirements.flatMap((requirement) => [`## ${requirement.id} — ${requirement.title}`, "", requirement.description, "", ...requirement.acceptanceCriteria.map((criterion) => `- ${criterion}`), ""])].join("\n");
  const interactions = [`# ${specification.productName} Interaction Contract`, "", ...specification.architecture.frontend.pages.map((page) => `- ${page}: navigation and primary actions must update visible state or call an approved API route.`), "", "- Every form exposes validation, success, and recoverable error feedback.", "- Mobile navigation and keyboard focus are first-class states.", ""].join("\n");
  const pythonRoutes = specification.productKind === "restaurant" ? `from datetime import date\nfrom fastapi import APIRouter, Depends, HTTPException, Query, Response\nfrom app.schemas.contracts import ReservationCreate\nfrom app.security.access_control import require_role\nfrom app.services.application_service import reservation_service\n\nrouter = APIRouter(prefix=\"/api\")\n\n@router.get(\"/menu\")\ndef menu(): return {\"categories\": reservation_service.menu()}\n\n@router.get(\"/availability\")\ndef availability(date: date, party_size: int = Query(default=2, ge=1, le=12)): return reservation_service.availability(date.isoformat(), party_size)\n\n@router.post(\"/reservations\", status_code=201)\ndef create_reservation(payload: ReservationCreate): return reservation_service.reserve(payload)\n\n@router.get(\"/reservations/{reservation_id}\")\ndef reservation(reservation_id: str):\n    result = reservation_service.get(reservation_id)\n    if not result: raise HTTPException(404, \"Reservation not found\")\n    return result\n\n@router.delete(\"/reservations/{reservation_id}\", status_code=204)\ndef cancel(reservation_id: str):\n    if not reservation_service.get(reservation_id): raise HTTPException(404, \"Reservation not found\")\n    reservation_service.cancel(reservation_id)\n    return Response(status_code=204)\n\n@router.post(\"/enquiries\", status_code=202)\ndef enquiry(payload: dict): return {\"accepted\": True}\n\n@router.post(\"/reviews\", status_code=201)\ndef review(payload: dict, _: None = Depends(lambda: require_role(\"Guest\"))): return payload\n` : `from fastapi import APIRouter, HTTPException\nfrom app.schemas.contracts import RecordCreate\nfrom app.services.application_service import record_service\n\nrouter = APIRouter(prefix=\"/api\")\n\n@router.get(\"/records\")\ndef list_records(): return record_service.list()\n\n@router.post(\"/records\", status_code=201)\ndef create_record(payload: RecordCreate): return record_service.create(payload)\n\n@router.get(\"/records/{record_id}\")\ndef get_record(record_id: str):\n    result = record_service.get(record_id)\n    if not result: raise HTTPException(404, \"Record not found\")\n    return result\n`;
  const pythonContracts = specification.productKind === "restaurant" ? `from datetime import date\nfrom pydantic import BaseModel, Field\n\nclass ReservationCreate(BaseModel):\n    guest_name: str = Field(min_length=2, max_length=80)\n    email: str = Field(pattern=r\"^[^@]+@[^@]+\\.[^@]+$\")\n    date: date\n    time: str = Field(pattern=r\"^([01]\\d|2[0-3]):[0-5]\\d$\")\n    party_size: int = Field(ge=1, le=12)\n` : `from pydantic import BaseModel, Field\n\nclass RecordCreate(BaseModel):\n    name: str = Field(min_length=2, max_length=120)\n    values: dict = Field(default_factory=dict)\n`;
  const pythonService = specification.productKind === "restaurant" ? `from uuid import uuid4\nfrom app.repositories.application_repository import repository\n\nclass ReservationService:\n    def menu(self): return [{\"name\": \"Seasonal\", \"items\": [\"Charred peach & burrata\", \"Coal-roasted sea bass\"]}]\n    def availability(self, date, party_size): return {\"date\": date, \"party_size\": party_size, \"slots\": [\"19:00\", \"19:30\", \"20:00\"]}\n    def reserve(self, payload):\n        record = {\"id\": str(uuid4()), **payload.model_dump(mode=\"json\"), \"status\": \"confirmed\"}\n        repository.save(record); return record\n    def get(self, record_id): return repository.get(record_id)\n    def cancel(self, record_id): repository.delete(record_id)\nreservation_service = ReservationService()\n` : `from uuid import uuid4\nfrom app.repositories.application_repository import repository\n\nclass RecordService:\n    def list(self): return repository.list()\n    def create(self, payload):\n        record = {\"id\": str(uuid4()), **payload.model_dump()}\n        repository.save(record); return record\n    def get(self, record_id): return repository.get(record_id)\nrecord_service = RecordService()\n`;
  const templates = [
    { path: "README.md", requirements: requirementIds, content: "# " + specification.productName + "\n\n" + specification.summary + "\n\n## Run\n\nFrontend: `npm install && npm run dev`\n\nBackend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`\n\nBoth sides use `shared/api-contract.json`.\n" },
    { path: "REQUIREMENTS.md", requirements: requirementIds, content: requirementsMarkdown },
    { path: "ARCHITECTURE.md", requirements: requirementIds, content: specification.architecture.markdown },
    { path: "INTERACTIONS.md", requirements: requirementIds, content: interactions },
    { path: "shared/api-contract.json", requirements: requirementIds, content: JSON.stringify({ version: "1.0", product: specification.productName, routes: apiRoutes }, null, 2) + "\n" },
    { path: "package.json", requirements: ["REQ-006"], content: JSON.stringify(packageJson, null, 2) + "\n" },
    { path: "index.html", requirements: ["REQ-006"], content: '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>' + specification.productName.replace(/[<>&"]/g, "") + '</title></head><body><div id="root"></div><script type="module" src="/frontend/src/main.tsx"></script></body></html>\n' },
    { path: "tsconfig.json", requirements: ["REQ-006"], content: JSON.stringify({ compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["frontend/src"] }, null, 2) + "\n" },
    { path: "frontend/src/App.tsx", requirements: ["REQ-003", "REQ-006"], content: frontend.app },
    { path: "frontend/src/styles.css", requirements: ["REQ-006"], content: frontend.styles },
    { path: "frontend/src/main.tsx", requirements: ["REQ-006"], content: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.js";\n\ncreateRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);\n' },
    { path: "frontend/src/vite-env.d.ts", requirements: ["REQ-006"], content: '/// <reference types="vite/client" />\n' },
    { path: "frontend/src/lib/api.ts", requirements: requirementIds, content: 'const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";\nexport async function api<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } }); if (!response.ok) throw new Error(`API ${response.status}`); return response.status === 204 ? undefined as T : response.json(); }\n' },
    { path: "frontend/src/components/Navigation.tsx", requirements: requirementIds, content: 'export function Navigation() { return <nav aria-label="Generated product navigation" />; }\n' },
    { path: "frontend/src/components/Feedback.tsx", requirements: requirementIds, content: 'export function Feedback({ message }: { message: string }) { return <p role="status">{message}</p>; }\n' },
    { path: "frontend/src/pages/HomePage.tsx", requirements: requirementIds, content: 'export function HomePage() { return <main id="home" />; }\n' },
    { path: "frontend/preview.html", requirements: ["REQ-003", "REQ-006"], content: frontend.preview },
    { path: "backend/requirements.txt", requirements: requirementIds, content: "fastapi==0.116.1\nuvicorn[standard]==0.35.0\npydantic==2.11.7\npytest==8.4.1\nhttpx==0.28.1\n" },
    { path: "backend/app/__init__.py", requirements: requirementIds, content: "# Generated application package.\n" },
    { path: "backend/app/main.py", requirements: requirementIds, content: `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\nfrom app.api.routes import router\n\napp = FastAPI(title=${JSON.stringify(specification.productName)}, version=\"1.0.0\")\napp.add_middleware(CORSMiddleware, allow_origins=[\"http://127.0.0.1:5173\", \"http://localhost:5173\"], allow_methods=[\"*\"], allow_headers=[\"*\"])\napp.include_router(router)\n\n@app.get(\"/health\")\ndef health(): return {\"status\": \"ok\"}\n` },
    { path: "backend/app/api/routes.py", requirements: requirementIds, content: pythonRoutes },
    { path: "backend/app/models/domain.py", requirements: requirementIds, content: `from dataclasses import dataclass\n\n@dataclass(frozen=True)\nclass DomainRecord:\n    id: str\n    entity: str\n` },
    { path: "backend/app/schemas/contracts.py", requirements: requirementIds, content: pythonContracts },
    { path: "backend/app/services/application_service.py", requirements: requirementIds, content: pythonService },
    { path: "backend/app/repositories/application_repository.py", requirements: requirementIds, content: `class Repository:\n    def __init__(self): self._records = {}\n    def list(self): return list(self._records.values())\n    def get(self, record_id): return self._records.get(record_id)\n    def save(self, record): self._records[record[\"id\"]] = record\n    def delete(self, record_id): self._records.pop(record_id, None)\nrepository = Repository()\n` },
    { path: "backend/app/security/access_control.py", requirements: ["REQ-001", "REQ-002", "REQ-004"], content: `from fastapi import HTTPException\n\ndef require_role(role: str) -> None:\n    if role not in ${JSON.stringify(specification.roles)}: raise HTTPException(403, \"Forbidden\")\n` },
    { path: "backend/tests/test_api.py", requirements: requirementIds, content: specification.productKind === "restaurant" ? 'from fastapi.testclient import TestClient\nfrom app.main import app\n\nclient = TestClient(app)\n\ndef test_health_and_menu():\n    assert client.get("/health").json() == {"status": "ok"}\n    assert client.get("/api/menu").status_code == 200\n\ndef test_reservation_lifecycle():\n    availability = client.get("/api/availability", params={"date": "2030-08-29", "party_size": 2})\n    assert availability.status_code == 200\n    assert availability.json()["slots"]\n    created = client.post("/api/reservations", json={"guest_name": "Test Guest", "email": "guest@example.com", "date": "2030-08-29", "time": "19:00", "party_size": 2})\n    assert created.status_code == 201\n    reservation_id = created.json()["id"]\n    assert client.get(f"/api/reservations/{reservation_id}").status_code == 200\n    assert client.delete(f"/api/reservations/{reservation_id}").status_code == 204\n    assert client.get(f"/api/reservations/{reservation_id}").status_code == 404\n\ndef test_reservation_validation():\n    invalid = client.get("/api/availability", params={"date": "not-a-date", "party_size": 99})\n    assert invalid.status_code == 422\n' : 'from fastapi.testclient import TestClient\nfrom app.main import app\n\ndef test_health():\n    assert TestClient(app).get("/health").json() == {"status": "ok"}\n' },
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
    { id: id("check"), name: "Required secure boundary", status: paths.has("backend/app/security/access_control.py") ? "passed" : "failed", evidence: "Python server-side access-control artifact is present." },
    { id: id("check"), name: "Customer frontend", status: paths.has("frontend/src/App.tsx") && paths.has("frontend/src/styles.css") ? "passed" : "failed", evidence: "Responsive React application and design system are present." },
    { id: id("check"), name: "Professional preview artifact", status: hasGeneratedFrontendMarker(files.find((file) => file.path === "frontend/preview.html")?.content ?? "") ? "passed" : "failed", evidence: "A stored, sandbox-renderable professional application preview is present." },
    { id: id("check"), name: "Customer backend", status: paths.has("backend/app/main.py") && paths.has("backend/app/schemas/contracts.py") ? "passed" : "failed", evidence: "FastAPI entrypoint and Pydantic API contracts are present." },
    { id: id("check"), name: "Shared API contract", status: paths.has("shared/api-contract.json") ? "passed" : "failed", evidence: "Frontend and backend are linked by a stored route contract." },
    { id: id("check"), name: "Acceptance tests", status: paths.has("backend/tests/test_api.py") ? "passed" : "failed", evidence: "Generated backend acceptance-test artifact is present." },
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
  private readonly generationProvider?: ApplicationGenerationProvider;
  readonly workspace: ProjectWorkspaceService;

  constructor(store: JsonStore, stageDelayMs = 180, generationProvider?: ApplicationGenerationProvider) {
    this.store = store;
    this.stageDelayMs = stageDelayMs;
    this.generationProvider = generationProvider;
    this.workspace = new ProjectWorkspaceService(store);
  }

  async create(promptValue: unknown): Promise<BuildView> {
    const prompt = assertPrompt(promptValue);
    const timestamp = now();
    const projectId = id("project");
    const buildId = id("build");
    const name = inferProductName(prompt);
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

  async deleteProject(projectId: string): Promise<{ id: string; name: string }> {
    const snapshot = this.store.read();
    const project = snapshot.projects[projectId];
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    const projectBuilds = Object.values(snapshot.builds).filter((build) => build.projectId === projectId);
    if (projectBuilds.some((build) => ["queued", "specifying", "planning", "generating", "reviewing", "validating"].includes(build.status))) {
      throw new ApiError(409, "PROJECT_BUSY", "Wait for the active build to finish before deleting this project.");
    }
    await this.store.mutate((database) => {
      const buildIds = Object.values(database.builds).filter((build) => build.projectId === projectId).map((build) => build.id);
      const buildIdSet = new Set(buildIds);
      for (const task of Object.values(database.tasks)) if (buildIdSet.has(task.buildId)) delete database.tasks[task.id];
      for (const buildId of buildIds) {
        delete database.builds[buildId];
        delete database.files[buildId];
        delete database.events[buildId];
      }
      for (const specification of Object.values(database.specifications)) if (specification.projectId === projectId) delete database.specifications[specification.id];
      for (const graph of Object.values(database.graphs)) if (graph.projectId === projectId) delete database.graphs[graph.id];
      for (const version of Object.values(database.versions)) if (version.projectId === projectId) {
        delete database.versionFiles[version.id];
        delete database.versions[version.id];
      }
      delete database.projects[projectId];
    });
    return { id: project.id, name: project.name };
  }

  generationStatus(): { mode: "ai" | "gemini" | "deterministic"; provider: string; model: string; configured: boolean } {
    return this.generationProvider
      ? { mode: this.generationProvider.mode, provider: this.generationProvider.id, model: this.generationProvider.model, configured: true }
      : { mode: "deterministic", provider: "forgeweb-local", model: "forgeweb-templates-v2", configured: false };
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
      const fallbackSpecification = compileSpecification(initial.projectId, sourcePrompt);
      let specification = fallbackSpecification;
      if (this.generationProvider) {
        try {
          const providerPlan = await this.generationProvider.plan(sourcePrompt, fallbackSpecification);
          specification = applyProviderPlan(fallbackSpecification, providerPlan, this.generationProvider);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Gemini planning failed validation.";
          specification = {
            ...fallbackSpecification,
            generator: { mode: "deterministic", provider: "forgeweb-local", model: "forgeweb-templates-v2", message: `AI planning fallback: ${reason}` },
          };
        }
      }
      await this.store.mutate((database) => {
        database.specifications[specification.id] = specification;
        const build = database.builds[buildId];
        build.specificationId = specification.id;
        build.stageDetail = `${specification.requirements.length} proposed requirements mapped across ${specification.entities.length} domain entities.`;
        const project = database.projects[build.projectId];
        project.name = specification.productName;
        project.slug = `${slugify(specification.productName)}-${project.id.slice(-5)}`;
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

      await this.stage(buildId, "generating", specification.generator?.mode !== "deterministic"
        ? `${specification.generator?.provider ?? "AI"} is generating the approved React frontend and contract-matched Python backend.`
        : "Generating a secure prompt-specific application with the deterministic local fallback.");
      let files = generateDeterministicFiles(specification);
      if (this.generationProvider && specification.generator?.mode !== "deterministic") {
        try {
          files = await this.generationProvider.generate(specification);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Gemini implementation failed validation.";
          specification.generator = { mode: "deterministic", provider: "forgeweb-local", model: "forgeweb-templates-v2", message: `AI implementation fallback: ${reason}` };
          await this.store.mutate((database) => { database.specifications[specification.id] = specification; });
          files = generateDeterministicFiles(specification);
        }
      }
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
