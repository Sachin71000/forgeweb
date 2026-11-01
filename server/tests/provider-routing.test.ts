import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationProviderFromEnv, FrontendDualGeminiBackendProvider, GeminiGenerationProvider } from "../providers/generation-provider.ts";
import type { MasterSpecification } from "../domain.ts";

const spec = {} as MasterSpecification;
test("Groq backend override requests plain Python files instead of model-generated Base64", async (t) => {
  const paths = ["backend/app/models/domain.py", "backend/app/schemas/contracts.py", "backend/app/services/application_service.py", "backend/app/api/routes.py", "backend/app/main.py"];
  let waits = 0;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.match(url, /api.groq.com/);
    const request = JSON.parse(init.body as string);
    assert.match(request.messages[1].content, /NEVER Base64/);
    assert.equal(request.max_tokens, 800);
    const path = paths[calls++];
    assert.ok(request.messages[1].content.includes(`Return exactly ONE file: ${path}`));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ files: [{ path, content: "x = 1\n", requirementIds: ["REQ-001"] }] }) } }] }));
  });
  const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend", FORGEWEB_BACKEND_PROVIDER: "groq", GROQ_API_KEY: "test", GEMINI_API_KEY: "test", OPENROUTER_API_KEY: "test" }, { groqPacer: { async wait() { waits++; } } }) as FrontendDualGeminiBackendProvider;
  const input = { requirements: [], architecture: { backend: { modules: [], routes: [] }, data: { rules: [] } } } as unknown as MasterSpecification;
  const progress: string[] = [];
  const result = await provider.generateBackendManifest(input, async (detail) => { progress.push(detail); });
  assert.deepEqual(result.files.map((file) => file.path), paths);
  assert.ok(result.files.every((file) => file.content === "x = 1\n"));
  assert.equal(waits, 5);
  assert.equal(progress.length, 10);
  assert.match(progress[0], /Waiting for the shared rate-limit slot/);
  assert.match(progress[9], /Received source 5\/5/);
});
test("Groq override routes architecture and backend without calling Gemini", async () => {
  const calls: string[] = [];
  const groq = stage("groq", calls), gemini = stage("gemini", calls);
  groq.plan = async () => { calls.push("groq:plan"); throw new Error("test-stop"); };
  const provider = new FrontendDualGeminiBackendProvider([groq], [gemini], [groq]);
  await assert.rejects(provider.plan("test", spec), /test-stop/);
  await assert.rejects(provider.generateBackendManifest(spec), /backend-test-stop/);
  assert.deepEqual(calls, ["groq:plan", "groq:backend"]);
});
for (const failure of ["truncated", "wrong-path"]) {
  test(`file-by-file backend rejects ${failure} response before requesting more files`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ finish_reason: failure === "truncated" ? "length" : "stop", message: { content: JSON.stringify({ files: [{ path: "unexpected.py", content: "x=1", requirementIds: [] }] }) } }] }));
    });
    const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend", FORGEWEB_BACKEND_PROVIDER: "groq", GROQ_API_KEY: "test", GEMINI_API_KEY: "test", OPENROUTER_API_KEY: "test" }, { groqPacer: { async wait() {} } }) as FrontendDualGeminiBackendProvider;
    const input = { requirements: [], architecture: { backend: { modules: [], routes: [] }, data: { rules: [] } } } as unknown as MasterSpecification;
    await assert.rejects(provider.generateBackendManifest(input), failure === "truncated" ? /output limit/ : /Expected one complete/);
    assert.equal(calls, 2, "Groq stops that file; the configured Gemini fallback is attempted once");
  });
}
for (const recovery of [true, false]) {
  test(`per-file Python repair is bounded and paced: recovery=${recovery}`, async (t) => {
    let calls = 0;
    let waits = 0;
    t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      const path = body.messages[1].content.match(/Return exactly ONE file: ([^ ]+)\./)[1];
      const content = recovery && calls > 1 ? "x=1\n" : "def invalid(:\n";
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ files: [{ path, content, requirementIds: [] }] }) } }] }));
    });
    const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend", FORGEWEB_BACKEND_PROVIDER: "groq", GROQ_API_KEY: "test", GEMINI_API_KEY: "test", OPENROUTER_API_KEY: "test" }, { groqPacer: { async wait() { waits++; } } }) as FrontendDualGeminiBackendProvider;
    const input = { requirements: [], architecture: { backend: { modules: [], routes: [] }, data: { rules: [] } } } as unknown as MasterSpecification;
    if (recovery) assert.equal((await provider.generateBackendManifest(input)).files.length, 5);
    else await assert.rejects(provider.generateBackendManifest(input), /after one paced repair/);
    assert.equal(calls, recovery ? 6 : 3);
    assert.equal(waits, recovery ? 6 : 2, "Only Groq requests use its quota pacer");
  });
}
function stage(name: string, calls: string[]) {
  const provider = new GeminiGenerationProvider("test", name);
  provider.generateFrontendManifest = async () => { calls.push(`${name}:frontend`); return { files: [] }; };
  provider.generateBackendManifest = async () => { calls.push(`${name}:backend`); throw new Error("backend-test-stop"); };
  return provider;
}
test("requested routing tries Groq then OpenRouter frontend and only Gemini backend", async () => {
  const calls: string[] = [];
  const groq = stage("groq", calls), router = stage("openrouter", calls), gemini = stage("gemini", calls);
  groq.generateFrontendManifest = async () => { calls.push("groq:frontend"); throw new Error("unavailable"); };
  const provider = new FrontendDualGeminiBackendProvider([groq, router], [gemini]);
  await assert.rejects(provider.generate(spec), /backend-test-stop/);
  assert.deepEqual(calls, ["groq:frontend", "openrouter:frontend", "gemini:backend"]);
});
test("separate-project Gemini quota fails over once to the next configured key", async () => {
  const calls: string[] = [];
  const front = stage("front", calls), primary = stage("primary", calls), backup = stage("backup", calls);
  front.generateFrontendManifest = async () => { throw new Error("unavailable"); };
  primary.generateBackendManifest = async () => { calls.push("primary:backend"); throw new Error("status 429 RESOURCE_EXHAUSTED"); };
  await assert.rejects(new FrontendDualGeminiBackendProvider([front], [primary, backup]).generate(spec), /429/);
  assert.deepEqual(calls, ["primary:frontend", "primary:backend", "backup:backend"]);
});
test("new routing requires all primary credentials and does not expose keys in model metadata", () => {
  assert.throws(() => createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend" }), /requires/);
  const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend", GEMINI_API_KEY: "secret-primary", GROQ_API_KEY: "secret-groq", OPENROUTER_API_KEY: "secret-router", GEMINI_FALLBACK_API_KEY_1: "secret-backup" })!;
  assert.match(provider.model, /Frontend:/);
  assert.doesNotMatch(provider.model, /secret/);
});
test("backend quota chain tries Groq then three distinct Gemini project keys once", async (t) => {
  const sequence: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    sequence.push(url.includes('groq') ? 'groq' : headers['x-goog-api-key']);
    return new Response(JSON.stringify({ error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
  });
  const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: 'frontend-dual-gemini-backend', FORGEWEB_BACKEND_PROVIDER: 'groq', GROQ_API_KEY: 'groq', OPENROUTER_API_KEY: 'router', GEMINI_API_KEY: 'project-1', GEMINI_FALLBACK_API_KEY_1: 'project-2', GEMINI_FALLBACK_API_KEY_2: 'project-3' }, { groqPacer: { async wait() {} } }) as FrontendDualGeminiBackendProvider;
  const input = { requirements: [], architecture: { backend: { modules: [], routes: [] }, data: { rules: [] } } } as unknown as MasterSpecification;
  await assert.rejects(provider.generateBackendManifest(input), /backend generation failed/);
  assert.deepEqual(sequence, ['groq', 'project-1', 'project-2', 'project-3']);
});
