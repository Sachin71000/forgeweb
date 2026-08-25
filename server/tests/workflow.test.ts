import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AGENT_POLICY, enforceImplementationTask } from "../policy.ts";
import { normalizeMasterSpecification } from "../generated-frontend.ts";
import type { ApplicationGenerationProvider } from "../providers/generation-provider.ts";
import { JsonStore } from "../store.ts";
import { digest } from "../lib.ts";
import { BuildWorkflow, generateDeterministicFiles } from "../workflow.ts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-test-"));
  const store = new JsonStore(directory);
  await store.initialize();
  return { directory, store, workflow: new BuildWorkflow(store, 0) };
}

async function waitForBuild(workflow: BuildWorkflow, buildId: string, expected: string[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const build = workflow.get(buildId);
    if (expected.includes(build.status)) return build;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Build did not reach a terminal state.");
}

test("a prompt produces architecture first and source only after explicit confirmation", async () => {
  const { directory, workflow } = await fixture();
  try {
    const created = await workflow.create("Build a secure client portal with projects, invoices, files, and role-based access.");
    const proposal = await waitForBuild(workflow, created.id, ["awaiting_confirmation", "failed"]);
    assert.equal(proposal.status, "awaiting_confirmation");
    assert.equal(proposal.specification?.status, "proposed");
    assert.equal(proposal.specification?.requirements.length, 6);
    assert.match(proposal.specification?.architecture.markdown ?? "", /ARCHITECTURE|Architecture/);
    assert.equal(proposal.filePaths.length, 0);
    assert.equal(workflow.getProject(proposal.projectId).files.length, 0);

    await workflow.confirm(created.id);
    const build = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(build.status, "completed");
    assert.equal(build.specification?.status, "approved");
    assert.equal(build.specification?.requirements.length, 6);
    assert.equal(build.taskIds.length, 4);
    assert.equal(build.filePaths.length, 12);
    assert.ok(build.filePaths.includes("ARCHITECTURE.md"));
    assert.ok(build.filePaths.includes("frontend/src/App.tsx"));
    assert.ok(build.filePaths.includes("frontend/preview.html"));
    assert.ok(build.filePaths.includes("backend/src/index.ts"));
    assert.ok(build.validationChecks.every((check) => check.status === "passed"));
    assert.equal(build.project.status, "ready");
    const project = workflow.getProject(build.projectId);
    assert.equal(project.files.length, 12);
    assert.ok(project.graph);
    assert.ok(project.graph.nodes.some((node) => node.type === "requirement"));
    assert.ok(project.graph.edges.some((edge) => edge.type === "SATISFIED_BY"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an e-commerce prompt produces a commerce architecture and marketplace application", async () => {
  const { directory, workflow } = await fixture();
  try {
    const prompt = "Create a modern, responsive full-stack e-commerce platform with product categories, search and filters, product details, cart, wishlist, secure login and signup, checkout, payment integration, order tracking, customer profiles, reviews, and an admin dashboard for products, users, inventory, and orders.";
    const created = await workflow.create(prompt);
    const proposal = await waitForBuild(workflow, created.id, ["awaiting_confirmation", "failed"]);
    assert.equal(proposal.status, "awaiting_confirmation");
    assert.equal(proposal.specification?.productKind, "commerce");
    assert.equal(proposal.specification?.productName, "Nexa Market");
    assert.equal(proposal.specification?.requirements.length, 11);
    assert.deepEqual(proposal.specification?.entities, ["User", "Product", "Category", "InventoryItem", "Cart", "Wishlist", "Order", "Payment", "Review", "Address"]);
    assert.ok(proposal.specification?.architecture.frontend.pages.some((page) => /secure checkout/i.test(page)));
    assert.ok(proposal.specification?.architecture.frontend.pages.some((page) => /admin products/i.test(page)));
    assert.equal(proposal.filePaths.length, 0);

    await workflow.confirm(created.id);
    const build = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(build.status, "completed");
    const project = workflow.getProject(build.projectId);
    const preview = project.files.find((file) => file.path === "frontend/preview.html")?.content ?? "";
    const app = project.files.find((file) => file.path === "frontend/src/App.tsx")?.content ?? "";
    const contracts = project.files.find((file) => file.path === "backend/src/api/contracts.ts")?.content ?? "";
    const backend = project.files.find((file) => file.path === "backend/src/index.ts")?.content ?? "";
    assert.match(preview, /forgeweb-commerce-v1/);
    assert.match(preview, /class="global-search"/);
    assert.match(preview, /Popular categories/);
    assert.match(preview, /Shopping cart/);
    assert.match(preview, /Admin dashboard/);
    assert.match(app, /forgeweb-commerce-v1/);
    assert.match(contracts, /CheckoutInput/);
    assert.match(contracts, /PaymentWebhookEnvelope/);
    assert.match(backend, /paymentWebhook/);
    assert.match(backend, /adminInventory/);
    assert.ok(build.validationChecks.every((check) => check.status === "passed"));

    const legacy = normalizeMasterSpecification({
      ...proposal.specification!,
      productKind: undefined as never,
      productName: "Modern",
      architecture: {
        ...proposal.specification!.architecture,
        frontend: { ...proposal.specification!.architecture.frontend, pages: ["Role-aware dashboard", "File assets", "Inventory items"] },
      },
    });
    assert.equal(legacy.productName, "Nexa Market");
    assert.equal(legacy.productKind, "commerce");
    assert.ok(legacy.architecture.frontend.pages.some((page) => /checkout/i.test(page)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a configured model provider drives prompt-specific planning and modular file generation", async () => {
  const { directory, store } = await fixture();
  const provider: ApplicationGenerationProvider = {
    id: "google-gemini",
    model: "gemini-test-model",
    async plan() {
      return {
        productName: "Pulse Clinic",
        productKind: "generic",
        summary: "A calm patient booking and care coordination application for a neighborhood clinic.",
        roles: ["Patient", "Clinician", "Receptionist"],
        entities: ["User", "Appointment", "Clinician", "CareNote"],
        requirements: Array.from({ length: 6 }, (_, index) => ({ title: `Clinic requirement ${index + 1}`, description: `Clinic workflow ${index + 1} works from UI through API.`, acceptanceCriteria: [`Workflow ${index + 1} is observable.`], priority: "P0" as const })),
        frontendPages: ["Patient booking", "Clinician availability", "Upcoming visits", "Secure care profile"],
        frontendComponents: ["Booking stepper", "Availability calendar", "Visit card", "Care profile form"],
        visualDirection: "Warm editorial healthcare interface with a compact side rail, sage and clay accents, generous white space, and reassuring motion.",
        backendModules: ["Identity", "Appointments", "Clinician availability", "Care profiles"],
        apiRoutes: ["GET /api/clinicians", "POST /api/appointments", "GET /api/appointments/:id", "PATCH /api/appointments/:id"],
        dataRules: ["Appointments reference a patient and clinician", "Care notes are restricted to assigned clinicians"],
        security: ["Server-side role authorization", "Validated booking transitions", "Care data audit events"],
      };
    },
    async generate(specification) {
      const requirementIds = specification.requirements.map((requirement) => requirement.id);
      const base = generateDeterministicFiles(specification).map((file) => {
        if (!["frontend/src/App.tsx", "frontend/preview.html"].includes(file.path)) return file;
        const content = file.content.replaceAll("forgeweb-professional-v2", "forgeweb-ai-generated-v1");
        return { ...file, content, digest: digest(content) };
      });
      return [
        ...base,
        ...[
          ["frontend/src/pages/BookingPage.tsx", "export function BookingPage() { return <main>Book a visit</main>; }"],
          ["frontend/src/components/AvailabilityCalendar.tsx", "export function AvailabilityCalendar() { return <section>Availability</section>; }"],
          ["frontend/src/data/clinic.ts", "export const clinicName = 'Pulse Clinic';"],
        ].map(([path, content]) => ({ path, content, requirementIds, digest: digest(content) })),
      ];
    },
  };
  const workflow = new BuildWorkflow(store, 0, provider);
  try {
    const created = await workflow.create("Build a patient appointment booking and care coordination website for a neighborhood clinic.");
    const proposal = await waitForBuild(workflow, created.id, ["awaiting_confirmation", "failed"]);
    assert.equal(proposal.status, "awaiting_confirmation");
    assert.equal(proposal.specification?.productName, "Pulse Clinic");
    assert.equal(proposal.specification?.generator?.mode, "gemini");
    assert.equal(proposal.specification?.generator?.model, "gemini-test-model");
    assert.match(proposal.specification?.architecture.frontend.visualDirection ?? "", /sage and clay/i);
    assert.ok(proposal.specification?.architecture.backend.routes?.includes("POST /api/appointments"));

    await workflow.confirm(created.id);
    const completed = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(completed.status, "completed");
    assert.equal(completed.filePaths.length, 15);
    assert.ok(completed.filePaths.includes("frontend/src/pages/BookingPage.tsx"));
    assert.ok(completed.filePaths.includes("frontend/src/components/AvailabilityCalendar.tsx"));
    const workspace = await workflow.workspace.getReady(completed.projectId);
    assert.equal(workspace.currentVersion?.versionNumber, 1);
    assert.match(workspace.files.find((file) => file.path === "frontend/preview.html")?.content ?? "", /forgeweb-ai-generated-v1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project workspace supports real preview, scoped versions, restore, persistence, safe failure, and ZIP export", async () => {
  const { directory, workflow } = await fixture();
  try {
    const created = await workflow.create("Build a secure inventory dashboard with products, stock, clients, and role-based access.");
    await waitForBuild(workflow, created.id, ["awaiting_confirmation"]);
    await workflow.confirm(created.id);
    const build = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(build.status, "completed");

    const initial = workflow.workspace.get(build.projectId);
    assert.equal(initial.currentVersion?.versionNumber, 1);
    assert.equal(initial.versions.length, 1);
    const initialPreview = await workflow.workspace.getPreview(build.projectId);
    assert.match(initialPreview.html, /Inventory OS/i);
    assert.match(initialPreview.html, /forgeweb-professional-v2/);
    assert.match(initialPreview.html, /aria-label="Primary navigation"/);
    assert.match(initialPreview.html, /class="workspace-layout"/);
    const initialStyles = initial.files.find((file) => file.path === "frontend/src/styles.css")?.digest;
    const initialBackend = initial.files.find((file) => file.path === "backend/src/index.ts")?.digest;

    const edited = await workflow.workspace.edit(build.projectId, "Make the dashboard cards smaller and modern. Keep everything else unchanged.");
    assert.deepEqual(edited.modifiedFiles.sort(), ["frontend/preview.html", "frontend/src/styles.css"]);
    assert.equal(edited.workspace.currentVersion?.versionNumber, 2);
    assert.equal(edited.workspace.versions.length, 2);
    assert.notEqual(edited.workspace.files.find((file) => file.path === "frontend/src/styles.css")?.digest, initialStyles);
    assert.equal(edited.workspace.files.find((file) => file.path === "backend/src/index.ts")?.digest, initialBackend);

    const versionOne = edited.workspace.versions.find((version) => version.versionNumber === 1)!;
    const restored = await workflow.workspace.restore(build.projectId, versionOne.id);
    assert.equal(restored.currentVersion?.id, versionOne.id);
    assert.equal(restored.files.find((file) => file.path === "frontend/src/styles.css")?.digest, initialStyles);

    const currentBeforeFailure = restored.currentVersion?.id;
    await assert.rejects(
      () => workflow.workspace.edit(build.projectId, "Make invalid broken code by removing the closing brace from frontend styles."),
      { code: "EDIT_VALIDATION_FAILED" },
    );
    assert.equal(workflow.workspace.get(build.projectId).currentVersion?.id, currentBeforeFailure);

    const reloadedStore = new JsonStore(directory);
    await reloadedStore.initialize();
    const reloadedWorkflow = new BuildWorkflow(reloadedStore, 0);
    assert.equal(reloadedWorkflow.workspace.get(build.projectId).currentVersion?.id, currentBeforeFailure);

    const summary = await reloadedWorkflow.workspace.validateExport(build.projectId);
    assert.equal(summary.validation, "passed");
    assert.equal(summary.frontend, "generated");
    assert.equal(summary.backend, "generated");
    const exported = await reloadedWorkflow.workspace.export(build.projectId);
    assert.equal(exported.archive.subarray(0, 2).toString(), "PK");
    assert.ok(exported.archive.includes(Buffer.from("frontend/src/App.tsx")));
    assert.ok(exported.archive.includes(Buffer.from("backend/src/index.ts")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy projects automatically gain a versioned professional preview", async () => {
  const { directory, store, workflow } = await fixture();
  try {
    const created = await workflow.create("Build a secure inventory portal with products, stock alerts, suppliers, and team access.");
    await waitForBuild(workflow, created.id, ["awaiting_confirmation"]);
    await workflow.confirm(created.id);
    const build = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(build.status, "completed");

    await store.mutate((database) => {
      const project = database.projects[build.projectId];
      project.currentVersionId = undefined;
      project.currentVersionNumber = undefined;
      for (const version of Object.values(database.versions)) {
        if (version.projectId === build.projectId) {
          delete database.versionFiles[version.id];
          delete database.versions[version.id];
        }
      }
      const legacyPaths: Record<string, string> = {
        "backend/src/domain/model.ts": "src/domain/model.ts",
        "backend/src/security/access-control.ts": "src/security/access-control.ts",
        "backend/src/api/contracts.ts": "src/api/contracts.ts",
      };
      database.files[build.id] = database.files[build.id]
        .filter((file) => ["README.md", "package.json", "tests/acceptance.test.ts", ...Object.keys(legacyPaths)].includes(file.path))
        .map((file) => ({ ...file, path: legacyPaths[file.path] ?? file.path }));
      const packageFile = database.files[build.id].find((file) => file.path === "package.json")!;
      packageFile.content = '{"name":"legacy-project","private":true,"scripts":{"test":"node --test"}}\n';
      packageFile.digest = "sha256:legacy-package";
      database.builds[build.id].filePaths = database.files[build.id].map((file) => file.path);
      delete (database.specifications[project.currentSpecificationId!] as { architecture?: unknown }).architecture;
    });

    const repaired = await workflow.workspace.getReady(build.projectId);
    assert.equal(repaired.currentVersion?.versionNumber, 1);
    assert.equal(repaired.currentVersion?.label, "Professional interface upgrade");
    assert.equal(repaired.files.length, 12);
    assert.ok(repaired.files.some((file) => file.path === "frontend/preview.html"));
    assert.ok(repaired.specification?.architecture);
    assert.ok(repaired.files.every((file) => !file.path.startsWith("src/")));
    assert.match((await workflow.workspace.getPreview(build.projectId)).html, /aria-label="Primary navigation"/);

    await store.mutate((database) => {
      const versionId = database.projects[build.projectId].currentVersionId!;
      const preview = database.versionFiles[versionId].find((file) => file.path === "frontend/preview.html")!;
      preview.content = "<!doctype html><html><body>Legacy preview</body></html>";
      preview.digest = "sha256:legacy";
    });
    const upgraded = await workflow.workspace.getReady(build.projectId);
    assert.equal(upgraded.currentVersion?.versionNumber, 2);
    assert.match(upgraded.files.find((file) => file.path === "frontend/preview.html")?.content ?? "", /forgeweb-professional-v2/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a saved generic e-commerce dashboard upgrades to the commerce experience", async () => {
  const { directory, store, workflow } = await fixture();
  try {
    const created = await workflow.create("Create a modern responsive e-commerce marketplace with products, categories, cart, wishlist, checkout, payments, order tracking, reviews, and an admin dashboard.");
    await waitForBuild(workflow, created.id, ["awaiting_confirmation"]);
    await workflow.confirm(created.id);
    const build = await waitForBuild(workflow, created.id, ["completed", "failed"]);
    assert.equal(build.status, "completed");

    await store.mutate((database) => {
      const project = database.projects[build.projectId];
      const specification = database.specifications[project.currentSpecificationId!];
      project.name = "Modern";
      project.slug = `modern-${project.id.slice(-6)}`;
      specification.productName = "Modern";
      delete (specification as { productKind?: unknown }).productKind;
      specification.architecture.frontend.pages = ["Role-aware dashboard", "File assets", "Inventory items"];
      const versionFiles = database.versionFiles[project.currentVersionId!];
      for (const file of versionFiles.filter((candidate) => ["frontend/src/App.tsx", "frontend/preview.html"].includes(candidate.path))) {
        file.content = file.content.replaceAll("forgeweb-commerce-v1", "forgeweb-professional-v2");
        file.digest = "sha256:legacy-commerce-dashboard";
      }
    });

    const upgraded = await workflow.workspace.getReady(build.projectId);
    assert.equal(upgraded.currentVersion?.versionNumber, 2);
    assert.equal(upgraded.project.name, "Nexa Market");
    assert.equal(upgraded.specification?.productKind, "commerce");
    assert.ok(upgraded.specification?.architecture.frontend.pages.some((page) => /checkout/i.test(page)));
    assert.match((await workflow.workspace.getPreview(build.projectId)).html, /forgeweb-commerce-v1/);
    assert.match((await workflow.workspace.getPreview(build.projectId)).html, /Popular categories/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prompt validation fails before creating project state", async () => {
  const { directory, workflow } = await fixture();
  try {
    await assert.rejects(() => workflow.create("short"), { code: "PROMPT_TOO_SHORT" });
    assert.equal(workflow.listProjects().length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the policy rejects generated files outside the task path scope", () => {
  const task = {
    id: "task_test",
    buildId: "build_test",
    role: "implementation" as const,
    objective: "Test scope",
    requirementIds: ["REQ-001"],
    allowedPaths: ["src/"],
    forbiddenPaths: [".env"],
    behaviorToPreserve: [],
    assumptions: [],
    simplestSufficientApproach: "One file",
    changeBudget: { maxFiles: 1, maxAddedLines: 10, maxDeletedLines: 0 },
    acceptanceCriteria: ["Scoped"],
    validationPlan: ["Policy check"],
    policyPackVersion: AGENT_POLICY.version,
    policySourceRevision: AGENT_POLICY.sourceRevision,
    policySourceDigest: AGENT_POLICY.sourceDigest,
    status: "ready" as const,
  };
  assert.throws(
    () => enforceImplementationTask(task, [{ path: ".env", content: "SECRET=x", requirementIds: ["REQ-001"], digest: "sha256:test" }]),
    { code: "PATH_SCOPE_VIOLATION" },
  );
});
