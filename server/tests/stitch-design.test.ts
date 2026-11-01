import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store.ts";
import { BuildWorkflow } from "../workflow.ts";
import { ApiError } from "../lib.ts";
import { createStitchDesignerFromEnv, downloadStitchHtml, retrieveStitchDesign, type StitchClient, type StitchRequest } from "../providers/stitch-design.ts";
import { frontendImplementationPrompt } from "../generation/master-prompt.ts";

test("Stitch is opt-in and missing enabled credentials fail closed", async () => {
  assert.equal(createStitchDesignerFromEnv({}), undefined);
  await assert.rejects(createStitchDesignerFromEnv({ FORGEWEB_STITCH_ENABLED: "true" })!.design({} as never), /key is missing/);
});
test("Stitch artifact URLs reject local hosts and credential-bearing URLs before fetching", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(""); });
  for (const url of ["http://127.0.0.1/", "https://evil.example/", "https://googleapis.com.evil.example/", "https://user:password@googleusercontent.com/"]) await assert.rejects(downloadStitchHtml(url), /untrusted/);
  assert.equal(calls, 0);
});
test("Stitch artifacts are bounded and checked as complete design documents", async (t) => {
  let body = '<html><body>design</body></html>';
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(init.redirect, "error");
    assert.equal(init.headers, undefined, "Do not send API credentials to artifact URLs");
    return new Response(body);
  });
  assert.equal(await downloadStitchHtml("https://lh3.googleusercontent.com/design"), body);
  body = "not html";
  await assert.rejects(downloadStitchHtml("https://lh3.googleusercontent.com/design"), /complete HTML/);
  body = 'a'.repeat(512_001);
  await assert.rejects(downloadStitchHtml("https://lh3.googleusercontent.com/design"), /supported size/);
});

test("Stitch API HTML download uses its key only for the exact API host", async (t) => {
  const calls: Array<{ host: string; key?: string }> = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    calls.push({ host: url.hostname, key: (init.headers as Record<string,string> | undefined)?.['X-Goog-Api-Key'] });
    assert.equal(init.redirect, 'error');
    return new Response('<html><body>design</body></html>');
  });
  for (const host of ['stitch.googleapis.com', 'lh3.googleusercontent.com', 'storage.googleapis.com']) await downloadStitchHtml(`https://${host}/asset`, 'test-private-key');
  assert.deepEqual(calls.map((call) => call.key), ['test-private-key', undefined, undefined]);
});
test("authenticated Stitch JSON dataString artifact is decoded into HTML", async (t) => {
  const html = '<!doctype html><html><body>real artifact</body></html>';
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({dataString:html}),{headers:{'content-type':'application/json; charset=UTF-8'}}));
  assert.equal(await downloadStitchHtml('https://stitch.googleapis.com/asset','test-key'),html);
});
test("invalid JSON artifact envelopes fail without exposing their content", async (t) => {
  let body = '{bad';
  t.mock.method(globalThis,'fetch',async()=>new Response(body,{headers:{'content-type':'application/json'}}));
  await assert.rejects(downloadStitchHtml('https://stitch.googleapis.com/asset','test-key'),/invalid artifact envelope/);
  body = JSON.stringify({unexpected:'private design content'});
  await assert.rejects(downloadStitchHtml('https://stitch.googleapis.com/asset','test-key'),/did not contain HTML dataString/);
});

test("expired artifact link is refreshed from get_screen before a bounded download retry", async (t) => {
  let metadataCalls = 0;
  const client: StitchClient = { async callTool<T>() {
    return { htmlCode: { downloadUrl: `https://stitch.googleapis.com/${++metadataCalls === 1 ? 'expired' : 'fresh'}` } } as T;
  }, async close() {} };
  t.mock.method(globalThis, 'fetch', async (url: URL) => url.pathname === '/expired' ? new Response('denied', { status:403 }) : new Response('<html><body>fresh</body></html>'));
  const result = await retrieveStitchDesign(client, { projectId:'test',screenId:'screen' }, async()=>{}, 'test-key');
  assert.match(result.html, /fresh/);
  assert.equal(metadataCalls, 2);
});

test("persisted Stitch request retries retrieval without recreating or regenerating", async (t) => {
  const calls: string[] = [];
  const client: StitchClient = { async callTool<T>(name: string) {
    calls.push(name);
    if (name === 'list_screens') return {} as T;
    if (name === 'get_project') return { screenInstances: [{screen:{id:'saved-screen'}}] } as T;
    if (name === 'get_screen') return {htmlCode:{downloadUrl:'https://stitch.googleapis.com/saved'}} as T;
    throw new Error('Unexpected generation');
  }, async close() {} };
  t.mock.method(globalThis,'fetch',async()=>new Response('<html><body>saved</body></html>'));
  const designer = createStitchDesignerFromEnv({FORGEWEB_STITCH_ENABLED:'true',STITCH_API_KEY:'test-key'}, {clientFactory:()=>client,delay:async()=>{}})!;
  const checkpoint: StitchRequest[] = [];
  const result = await designer.design({stitchRequest:{projectId:'saved-project',generationStarted:true}} as never,async(request)=>{checkpoint.push(request)});
  assert.equal(result.screenId,'saved-screen');
  assert.deepEqual(calls,['list_screens','get_project','get_screen']);
  assert.equal(checkpoint.at(-1)?.screenId,'saved-screen');
});

test("empty Stitch screen index stops after bounded polling and never duplicates generation", async () => {
  let calls = 0;
  const client: StitchClient = {async callTool<T>(){ calls++; return {} as T; },async close(){}};
  await assert.rejects(retrieveStitchDesign(client,{projectId:'pending'},async()=>{}),/not exposed/);
  assert.equal(calls,6);
});

test("Stitch runs only after approval, pauses on failure, and retries without changing the approved requirements", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-stitch-"));
  const store = new JsonStore(directory);
  await store.initialize();
  let calls = 0;
  let fail = true;
  const design = { projectId: "design-project", screenId: "screen", html: '<html><body>cream reference<script>unsafe()</script></body></html>', createdAt: new Date().toISOString() };
  const workflow = new BuildWorkflow(store, 0, undefined, { async design(spec) {
    assert.equal(spec.status, "approved"); calls++;
    if (fail) throw new ApiError(503, "STITCH_UNAVAILABLE", "Stitch unavailable; retry");
    return design;
  } });
  const wait = async (id: string, status: string) => {
    for (let i = 0; i < 2000; i++) {
      const build = workflow.get(id);
      if (build.status === status) return build;
      if (build.status === "failed") throw new Error(build.stageDetail);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Timed out");
  };
  try {
    const created = await workflow.create("Build a cream client portal with projects and files.");
    const proposal = await wait(created.id, "awaiting_confirmation");
    assert.equal(calls, 0);
    const original = structuredClone(proposal.specification!.requirements);
    await workflow.confirm(created.id);
    const paused = await wait(created.id, "awaiting_confirmation");
    assert.equal(paused.error?.code, "STITCH_UNAVAILABLE");
    assert.equal(paused.filePaths.length, 0);
    assert.equal(calls, 1);
    fail = false;
    await workflow.confirm(created.id);
    const complete = await wait(created.id, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(complete.specification!.requirements, original);
    assert.deepEqual(complete.specification!.stitchDesign, design);
    assert.equal(complete.error, undefined);
    const prompt = frontendImplementationPrompt(complete.specification!);
    assert.match(prompt, /cream reference/);
    assert.doesNotMatch(prompt, /unsafe\(\)/);
    assert.match(prompt, /untrusted design DATA/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
