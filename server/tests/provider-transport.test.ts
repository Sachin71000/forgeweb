import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRetry, networkFailureDetail, redactProviderDetail } from "../providers/transport.ts";
import { GeminiGenerationProvider, createGenerationProviderFromEnv } from "../providers/generation-provider.ts";
import type { MasterSpecification } from "../domain.ts";

const specification = { projectId: "test", prompt: "Build a cafe", requirements: [], roles: [], entities: [], productKind: "restaurant" } as unknown as MasterSpecification;

for (const failure of ["malformed", "truncated", "null"]) {
  test(`Gemini repairs ${failure} output once with a larger bounded budget`, async (t) => {
    const budgets: number[] = [];
    t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      budgets.push(JSON.parse(init.body as string).generationConfig.maxOutputTokens);
      const first = budgets.length === 1;
      return new Response(JSON.stringify({ candidates: [{ finishReason: first && failure === "truncated" ? "MAX_TOKENS" : "STOP", content: { parts: [{ text: first ? (failure === "null" ? "null" : "{broken") : '{"productName":"Cafe"}' }] } }] }));
    });
    assert.equal((await new GeminiGenerationProvider("test-key").plan("Build a cafe", specification)).productName, "Cafe");
    assert.deepEqual(budgets, [4500, 9000]);
  });
}
test("Gemini repeated invalid output exhausts one repair", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{bad" }] } }] })); });
  await assert.rejects(new GeminiGenerationProvider("test-key").plan("Build a cafe", specification), /invalid structured output/);
  assert.equal(calls, 2);
});
test("Gemini safety stop does not trigger JSON repair", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] })); });
  await assert.rejects(new GeminiGenerationProvider("test-key").plan("Build a cafe", specification), /stopped generation/);
  assert.equal(calls, 1);
});

for (const status of [200, 400, 401, 402, 403, 404, 429]) {
  test(`HTTP ${status} is not retried`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("{}", { status }); });
    assert.equal((await fetchWithRetry("https://provider.test", {})).status, status);
    assert.equal(calls, 1);
  });
}

test("reported frontend failure exhausts Gemini, Groq JSON modes, then credit-limited OpenRouter", async (t) => {
  const calls: Array<{ host: string; mode?: string; budget: number }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const host = new URL(url).hostname;
    const body = JSON.parse(init.body as string);
    calls.push({ host, mode: body.response_format?.type, budget: body.max_tokens ?? body.generationConfig?.maxOutputTokens });
    if (host.includes("googleapis")) return new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 });
    if (host.includes("groq")) return new Response(JSON.stringify({ error: { message: "Failed to generate JSON.", code: "json_validate_failed", failed_generation: "PRIVATE_GENERATED_SOURCE" } }), { status: 400 });
    return new Response(JSON.stringify({ error: { message: "Requested 5200 tokens, can only afford 2853." } }), { status: 402 });
  });
  const provider = createGenerationProviderFromEnv({ GEMINI_API_KEY: "fake-gemini", GROQ_API_KEY: "fake-groq", OPENROUTER_API_KEY: "fake-router", FORGEWEB_GENERATION_MODE: "auto" })!;
  const input = { ...specification, architecture: { frontend: { pages: [], components: [] }, backend: { routes: [] } } } as unknown as MasterSpecification;
  await assert.rejects(provider.generate(input), (error: Error) => {
    assert.match(error.message, /503/);
    assert.match(error.message, /json_validate_failed/);
    assert.match(error.message, /402/);
    assert.doesNotMatch(error.message, /PRIVATE_GENERATED_SOURCE|fake-gemini|fake-groq|fake-router/);
    return true;
  });
  assert.equal(calls.filter((call) => call.host.includes("googleapis")).length, 3);
  assert.deepEqual(calls.filter((call) => call.host.includes("groq")).map(({ mode, budget }) => ({ mode, budget })), [{ mode: "json_schema", budget: 5200 }, { mode: "json_object", budget: 4800 }]);
  assert.equal(calls.filter((call) => call.host.includes("openrouter")).length, 1);
});
test("transient HTTP failure retries and recovers", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: ++calls === 1 ? 503 : 200 }));
  assert.equal((await fetchWithRetry("https://provider.test", {})).status, 200);
  assert.equal(calls, 2);
});
test("persistent transient errors stop at the attempt limit", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("{}", { status: 502 }); });
  assert.equal((await fetchWithRetry("https://provider.test", {}, 2)).status, 502);
  assert.equal(calls, 2);
});
test("abort cancels the backoff instead of making another request", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; controller.abort(); return new Response("{}", { status: 503 }); });
  await assert.rejects(fetchWithRetry("https://provider.test", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});
for (const [code, expected] of [["EACCES", /sandbox/], ["ENOTFOUND", /DNS/], ["SELF_SIGNED_CERT_IN_CHAIN", /TLS/], ["ETIMEDOUT", /timed out/], ["ECONNRESET", /reset/]] as const) {
  test(`network error ${code} gives actionable safe diagnostics`, () => {
    assert.match(networkFailureDetail({ cause: { code }, message: "secret URL" }), expected);
    assert.doesNotMatch(networkFailureDetail({ cause: { code }, message: "secret URL" }), /secret/);
  });
}
test("provider errors redact configured secrets", () => {
  assert.equal(redactProviderDetail("invalid test-secret-key", "test-secret-key"), "invalid [redacted]");
});
test("temporary DNS failure recovers with bounded retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) throw new TypeError("fetch failed", { cause: { code: "EAI_AGAIN" } });
    return new Response("{}");
  });
  assert.equal((await fetchWithRetry("https://provider.test", {})).status, 200);
  assert.equal(calls, 2);
});
test("connection reset is not replayed because a request may already have been accepted", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); });
  await assert.rejects(fetchWithRetry("https://provider.test", {}));
  assert.equal(calls, 1);
});
for (const providerName of ["gemini", "groq"] as const) {
  const makeProvider = () => providerName === "gemini" ? new GeminiGenerationProvider("test-secret-key")
    : createGenerationProviderFromEnv({ GROQ_API_KEY: "test-secret-key", FORGEWEB_GENERATION_MODE: "groq" })!;
  test(`${providerName} exposes sandbox cause without secrets`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => { throw new TypeError("test-secret-key", { cause: { code: "EACCES" } }); });
    await assert.rejects(makeProvider().plan("Build a cafe", specification), (error: Error) => /sandbox/.test(error.message) && !/test-secret-key/.test(error.message));
  });
  test(`${providerName} malformed HTTP JSON is not mislabeled as unreachable`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("not JSON"));
    await assert.rejects(makeProvider().plan("Build a cafe", specification), /invalid JSON response envelope/);
  });
  test(`${providerName} empty model response fails explicitly`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    await assert.rejects(makeProvider().plan("Build a cafe", specification), /no structured output/);
  });
}
