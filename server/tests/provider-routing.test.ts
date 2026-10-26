import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationProviderFromEnv, FrontendDualGeminiBackendProvider, GeminiGenerationProvider } from "../providers/generation-provider.ts";
import type { MasterSpecification } from "../domain.ts";

const spec = {} as MasterSpecification;
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
test("extra Gemini credential handles frontend failover but quota does not rotate Google keys", async () => {
  const calls: string[] = [];
  const front = stage("front", calls), primary = stage("primary", calls), backup = stage("backup", calls);
  front.generateFrontendManifest = async () => { throw new Error("unavailable"); };
  primary.generateBackendManifest = async () => { calls.push("primary:backend"); throw new Error("status 429 RESOURCE_EXHAUSTED"); };
  await assert.rejects(new FrontendDualGeminiBackendProvider([front], [primary, backup]).generate(spec), /429/);
  assert.deepEqual(calls, ["backup:frontend", "primary:backend"]);
});
test("new routing requires all primary credentials and does not expose keys in model metadata", () => {
  assert.throws(() => createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend" }), /requires/);
  const provider = createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: "frontend-dual-gemini-backend", GEMINI_API_KEY: "secret-primary", GROQ_API_KEY: "secret-groq", OPENROUTER_API_KEY: "secret-router", GEMINI_FALLBACK_API_KEY_1: "secret-backup" })!;
  assert.match(provider.model, /Frontend:/);
  assert.doesNotMatch(provider.model, /secret/);
});
