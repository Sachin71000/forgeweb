import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../server/store.ts";
import { BuildWorkflow } from "../server/workflow.ts";

const prompt = "Build a premium restaurant booking platform with a seasonal menu, pricing, dietary filters, table availability, reservations, private dining enquiries, reviews, customer acquisition, opening hours, and location details.";

async function waitForBuild(workflow: BuildWorkflow, buildId: string, statuses: string[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const build = workflow.get(buildId);
    if (statuses.includes(build.status)) return build;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The isolated restaurant build did not finish.");
}

const directory = await mkdtemp(join(tmpdir(), "forgeweb-restaurant-audit-"));
try {
  const store = new JsonStore(directory);
  await store.initialize();
  const workflow = new BuildWorkflow(store, 0);
  const created = await workflow.create(prompt);
  const proposal = await waitForBuild(workflow, created.id, ["awaiting_confirmation", "failed"]);
  if (proposal.status !== "awaiting_confirmation") throw new Error(`Architecture generation ended in ${proposal.status}.`);
  await workflow.confirm(created.id);
  const completed = await waitForBuild(workflow, created.id, ["completed", "failed"]);
  if (completed.status !== "completed") throw new Error(`Restaurant generation ended in ${completed.status}.`);
  const workspace = await workflow.workspace.getReady(created.projectId);
  const preview = await workflow.workspace.getPreview(created.projectId);
  process.stdout.write(JSON.stringify({
    proposal,
    projectId: created.projectId,
    preview: preview.html,
    files: workspace.files.map(({ path, content }) => ({ path, content })),
  }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
