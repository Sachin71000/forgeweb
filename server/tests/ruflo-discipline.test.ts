import assert from "node:assert/strict";
import test from "node:test";
import { FORGEWEB_MASTER_GENERATION_PROMPT } from "../generation/master-prompt.ts";
import { RUFLO_DISCIPLINE } from "../generation/ruflo-discipline.ts";
import { AGENT_POLICY } from "../policy.ts";
import { GeminiGenerationProvider, createGenerationProviderFromEnv } from "../providers/generation-provider.ts";
import type { MasterSpecification } from "../domain.ts";

test("Ruflo discipline is shared by policy and model instructions without false runtime claims", () => {
  assert.equal(AGENT_POLICY.orchestrationDiscipline, RUFLO_DISCIPLINE);
  assert.equal(RUFLO_DISCIPLINE.runtime, "external-cli-not-invoked");
  for (const rule of RUFLO_DISCIPLINE.rules) assert.ok(FORGEWEB_MASTER_GENERATION_PROMPT.includes(rule));
});

for (const providerName of ["gemini", "groq", "openrouter"]) {
  test(`${providerName} request receives generation discipline`, async (t) => {
    let instructions = "";
    t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      instructions = request.systemInstruction?.parts?.[0]?.text ?? request.messages?.[0]?.content;
      return new Response(providerName === "gemini" ? JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"productName":"test"}' }] } }] }) : JSON.stringify({ choices: [{ message: { content: '{"productName":"test"}' } }] }));
    });
    const provider = providerName === "gemini" ? new GeminiGenerationProvider("test") : createGenerationProviderFromEnv({ FORGEWEB_GENERATION_MODE: providerName, GROQ_API_KEY: "test", OPENROUTER_API_KEY: "test" })!;
    await provider.plan("Build a test portal", { projectId: "test", requirements: [], roles: [], entities: [] } as unknown as MasterSpecification);
    assert.ok(instructions.includes(RUFLO_DISCIPLINE.version));
    assert.match(instructions, /Never fabricate passing evidence/);
  });
}
