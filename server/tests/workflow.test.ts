import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AGENT_POLICY, enforceImplementationTask } from "../policy.ts";
import { JsonStore } from "../store.ts";
import { BuildWorkflow } from "../workflow.ts";

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
    assert.match(initialPreview.html, /Inventory Dashboard/i);
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
