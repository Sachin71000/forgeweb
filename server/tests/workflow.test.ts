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
    assert.equal(build.filePaths.length, 11);
    assert.ok(build.filePaths.includes("ARCHITECTURE.md"));
    assert.ok(build.filePaths.includes("frontend/src/App.tsx"));
    assert.ok(build.filePaths.includes("backend/src/index.ts"));
    assert.ok(build.validationChecks.every((check) => check.status === "passed"));
    assert.equal(build.project.status, "ready");
    const project = workflow.getProject(build.projectId);
    assert.equal(project.files.length, 11);
    assert.ok(project.graph);
    assert.ok(project.graph.nodes.some((node) => node.type === "requirement"));
    assert.ok(project.graph.edges.some((edge) => edge.type === "SATISFIED_BY"));
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
