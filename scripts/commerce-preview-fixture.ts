import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../server/store.ts";
import { BuildWorkflow } from "../server/workflow.ts";

const prompt = "Create a modern, responsive full-stack e-commerce platform with a clean and professional UI. Include product categories, search and filters, product details, cart, wishlist, secure login and signup, checkout, payment integration, order tracking, customer profile, reviews, and an admin dashboard to manage products, users, inventory, and orders. Use a scalable database, secure APIs, mobile-friendly design, fast performance, and smooth animations. Make the platform production-ready with a premium Amazon and Flipkart-style shopping experience.";

async function waitForBuild(workflow: BuildWorkflow, buildId: string, statuses: string[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const build = workflow.get(buildId);
    if (statuses.includes(build.status)) return build;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The isolated commerce build did not finish.");
}

const directory = await mkdtemp(join(tmpdir(), "forgeweb-commerce-audit-"));
try {
  const store = new JsonStore(directory);
  await store.initialize();
  const workflow = new BuildWorkflow(store, 0);
  const created = await workflow.create(prompt);
  const proposal = await waitForBuild(workflow, created.id, ["awaiting_confirmation", "failed"]);
  if (proposal.status !== "awaiting_confirmation") throw new Error(`Architecture generation ended in ${proposal.status}.`);
  await workflow.confirm(created.id);
  const completed = await waitForBuild(workflow, created.id, ["completed", "failed"]);
  if (completed.status !== "completed") throw new Error(`Commerce generation ended in ${completed.status}.`);
  const preview = await workflow.workspace.getPreview(created.projectId);
  process.stdout.write(JSON.stringify({ proposal, projectId: created.projectId, preview: preview.html }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
