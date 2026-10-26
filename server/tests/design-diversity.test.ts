import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeneratedFile } from "../domain.ts";
import type { ApplicationGenerationProvider } from "../providers/generation-provider.ts";
import { GeminiGenerationProvider, createGenerationProviderFromEnv } from "../providers/generation-provider.ts";
import { layoutStructure, repeatedLayout } from "../generation/design-diversity.ts";
import { frontendImplementationPrompt, planningPrompt } from "../generation/master-prompt.ts";
import { BuildWorkflow, generateDeterministicFiles } from "../workflow.ts";
import { JsonStore } from "../store.ts";
import { ApiError, digest } from "../lib.ts";

const prompt = "Build a client portal with a light cream background, projects, files and invoices.";
function provider(): ApplicationGenerationProvider {
  return {
    id: "groq", mode: "ai", model: "test",
    async plan(_prompt, spec) {
      return {
        productName: spec.productName, productKind: spec.productKind, summary: spec.summary,
        roles: spec.roles, entities: spec.entities, requirements: spec.requirements,
        frontendPages: spec.architecture.frontend.pages, frontendComponents: spec.architecture.frontend.components,
        visualDirection: "Cream editorial split composition", designFingerprint: "Editorial two-column navigation",
        navigationPattern: "Side navigation", interactionMap: ["Open projects"],
        backendModules: spec.architecture.backend.modules, apiRoutes: spec.architecture.backend.routes ?? [],
        dataRules: spec.architecture.data.rules, security: spec.architecture.security,
      };
    },
    async generate(spec) { return generateDeterministicFiles(spec); },
  };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-diversity-"));
  const store = new JsonStore(directory);
  await store.initialize();
  const fake = provider();
  return { directory, store, fake, workflow: new BuildWorkflow(store, 0, fake) };
}
async function wait(workflow: BuildWorkflow, id: string, states: string[]) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const build = workflow.get(id);
    if (states.includes(build.status)) return build;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Build timed out");
}
async function build(workflow: BuildWorkflow) {
  const created = await workflow.create(prompt);
  const proposal = await wait(workflow, created.id, ["awaiting_confirmation", "failed"]);
  if (proposal.status === "failed") return proposal;
  await workflow.confirm(created.id);
  return wait(workflow, created.id, ["completed", "failed"]);
}

for (const recover of [true, false]) {
  test(`invalid model output has a bounded repair: recovery=${recover}`, async () => {
    const { directory, fake, workflow } = await fixture();
    let calls = 0;
    fake.generate = async (spec) => {
      calls++;
      if (calls > 1) assert.match(spec.designContext?.revisionFeedback ?? "", /MODEL_PACKAGE_SCRIPT_MISSING/);
      if (!recover || calls === 1) throw new ApiError(422, "MODEL_PACKAGE_SCRIPT_MISSING", "Missing dev script");
      return generateDeterministicFiles(spec);
    };
    try {
      const result = await build(workflow);
      assert.equal(result.status, recover ? "completed" : "failed");
      assert.equal(calls, 2);
      if (!recover) assert.equal(result.filePaths.length, 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("layout comparison ignores changed copy, palette, classes, and scripts", () => {
  const html = `<body><header><nav><a>Home</a></nav></header><main>${"<section><h2>Title</h2><p>Copy</p></section>".repeat(4)}</main><script>run()</script></body>`;
  const file = (content: string): GeneratedFile => ({ path: "frontend/preview.html", content, digest: digest(content), requirementIds: [] });
  assert.equal(layoutStructure(html), layoutStructure(html.replaceAll("section>", 'section class="new">').replaceAll("Title", "Other")));
  assert.equal(repeatedLayout([file(html)], [[file(html.replaceAll("Copy", "Different"))]]), true);
  assert.equal(repeatedLayout([file(html.replace("<main>", "<main><aside>Navigation</aside>"))], [[file(html)]]), false);
  assert.equal(repeatedLayout([file("<main>Hello</main>")], [[file("<main>World</main>")]]), false);
});

for (const stage of ["plan", "generate"] as const) {
  test(`API ${stage} failure stays failed instead of producing a template`, async () => {
    const { directory, fake, workflow } = await fixture();
    fake[stage] = async () => { throw new Error("Provider quota exhausted: 429"); };
    try {
      const result = await build(workflow);
      assert.equal(result.status, "failed");
      assert.match(result.error?.message ?? "", /429/);
      assert.equal(result.filePaths.length, 0);
      assert.equal(workflow.getProject(result.projectId).files.length, 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("same prompt receives a new design seed and duplicate output fails after one redesign attempt", async () => {
  const { directory, fake, workflow } = await fixture();
  const original = fake.generate;
  const feedback: Array<string | undefined> = [];
  fake.generate = async (spec) => {
    feedback.push(spec.designContext?.revisionFeedback);
    return original(spec);
  };
  try {
    const first = await build(workflow);
    assert.equal(first.status, "completed", first.error?.message);
    const second = await build(workflow);
    assert.equal(second.status, "failed");
    assert.equal(second.error?.code, "REPEATED_LAYOUT");
    assert.equal(second.filePaths.length, 0);
    assert.equal(feedback.length, 3);
    assert.match(feedback[2] ?? "", /Redesign/);
    assert.notEqual(first.specification?.designContext?.seed, second.specification?.designContext?.seed);
    assert.ok(second.specification!.designContext!.recentCompositions.length);
    assert.match(planningPrompt(prompt, second.specification!), /Cream editorial/);
    assert.match(frontendImplementationPrompt(second.specification!), /designContext/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a genuinely changed composition passes the bounded redesign and is preserved on preview reads", async () => {
  const { directory, fake, workflow, store } = await fixture();
  const original = fake.generate;
  fake.generate = async (spec) => {
    const files = await original(spec);
    if (spec.designContext?.revisionFeedback) {
      const preview = files.find((file) => file.path === "frontend/preview.html")!;
      preview.content = preview.content.replace(/<main\b/, '<aside aria-label="Project navigation"><nav>Projects and files</nav></aside><main');
      preview.digest = digest(preview.content);
    }
    return files;
  };
  try {
    assert.equal((await build(workflow)).status, "completed");
    const second = await build(workflow);
    assert.equal(second.status, "completed", second.error?.message);
    // Simulate an AI-generated layout that fails legacy template-specific checks.
    await store.mutate((db) => {
      const version = db.projects[second.projectId].currentVersionId!;
      const preview = db.versionFiles[version].find((file) => file.path === "frontend/preview.html")!;
      preview.content = "<!doctype html><html><body><main>Custom AI composition</main></body></html>";
      preview.digest = digest(preview.content);
    });
    const before = workflow.workspace.get(second.projectId);
    const after = await workflow.workspace.getReady(second.projectId);
    assert.deepEqual(after.files, before.files);
    assert.equal(after.currentVersion?.id, before.currentVersion?.id);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Gemini-only generation composes frontend and Python backend before full-stack validation", async (t) => {
  const { directory, workflow } = await fixture();
  try {
    const created = await workflow.create(prompt);
    const proposal = await wait(workflow, created.id, ["awaiting_confirmation"]);
    const spec = proposal.specification!;
    const source = generateDeterministicFiles(spec);
    const frontendPaths = ["INTERACTIONS.md", "package.json", "frontend/src/App.tsx",
      "frontend/src/main.tsx", "frontend/src/styles.css", "frontend/src/lib/api.ts", "frontend/preview.html"];
    const frontend = { files: source.filter((file) => frontendPaths.includes(file.path)) };
    for (const name of ["ProjectList", "FileList"]) frontend.files.push({
      path: `frontend/src/components/${name}.tsx`, content: `export const ${name} = () => null;`,
      requirementIds: spec.requirements.map((requirement) => requirement.id), digest: "fixture",
    });
    const backend = Object.fromEntries([
      ["mainPy", "backend/app/main.py"], ["routesPy", "backend/app/api/routes.py"],
      ["domainPy", "backend/app/models/domain.py"], ["contractsPy", "backend/app/schemas/contracts.py"],
      ["servicePy", "backend/app/services/application_service.py"],
    ].map(([key, path]) => [key, Buffer.from(source.find((file) => file.path === path)!.content).toString("base64")]));
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (url: string) => {
      assert.match(url, /generativelanguage\.googleapis\.com/);
      const step = requests++;
      const payload = step === 0 ? { files: frontend.files.filter((file) => file.path !== "frontend/preview.html") } : step === 1 ? { files: frontend.files.filter((file) => file.path === "frontend/preview.html") } : {
        ...backend, requirementIds: spec.requirements.map((requirement) => requirement.id),
      };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
    });
    const files = await new GeminiGenerationProvider("test-key").generate(spec);
    assert.equal(requests, 3);
    assert.ok(files.some((file) => file.path === "backend/app/main.py"));
    assert.ok(files.some((file) => file.path === "frontend/src/App.tsx"));
    assert.ok(files.some((file) => file.path === "shared/api-contract.json"));
    requests = 0;
    const combined = createGenerationProviderFromEnv({ GEMINI_API_KEY: "test-key", GROQ_API_KEY: "test-groq", OPENROUTER_API_KEY: "test-router" })!;
    const combinedFiles = await combined.generate(spec);
    assert.equal(requests, 3, "Source, preview and backend use Gemini before any fallback");
    assert.ok(combinedFiles.some((file) => file.path === "backend/app/main.py"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
