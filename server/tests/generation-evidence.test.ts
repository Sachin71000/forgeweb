import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenerationEvidence } from "../providers/generation-evidence.ts";
import { createGenerationProviderFromEnv, FrontendDualGeminiBackendProvider } from "../providers/generation-provider.ts";
import { validatePythonSyntax } from "../python-validation.ts";
import type { MasterSpecification } from "../domain.ts";

test("failure evidence preserves source and reason but redacts configured credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(),'forgeweb-evidence-'));
  try {
    const evidence = new GenerationEvidence(directory,['private-key-one','private-key-two']);
    await evidence.record({event:'python_syntax_rejected',response:'private-key-one and private-key-two https://example.test/?key=private-query-value Bearer private-bearer-value',source:'def invalid(:',reason:'invalid syntax',pacingWaitMs:61000,networkMs:12});
    const [file] = await readdir(join(directory,'generation-diagnostics'));
    const report = await readFile(join(directory,'generation-diagnostics',file),'utf8');
    assert.doesNotMatch(report,/private-key-one|private-key-two|private-query-value|private-bearer-value/);
    assert.match(report,/def invalid\(:/);
    assert.match(report,/invalid syntax/);
    assert.equal(JSON.parse(report).networkMs,12);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("source cache rejects secrets and ignores corrupted or mismatched digests", async () => {
  const directory = await mkdtemp(join(tmpdir(),'forgeweb-cache-'));
  try {
    const evidence = new GenerationEvidence(directory,['private-key']);
    const file = {path:'backend/app/main.py',content:'x=1',requirementIds:['REQ-1']};
    await evidence.cacheFile('context-a',file);
    assert.deepEqual(await evidence.cachedFile('context-a'),file);
    assert.equal(await evidence.cachedFile('context-b'),undefined);
    const [name]=await readdir(join(directory,'generation-cache'));
    await writeFile(join(directory,'generation-cache',name),JSON.stringify({version:1,file:{...file,content:'changed'},digest:'wrong'}));
    assert.equal(await evidence.cachedFile('context-a'),undefined);
    await evidence.cacheFile('secret',{...file,content:'key="private-key"'});
    assert.equal(await evidence.cachedFile('secret'),undefined);
    await evidence.cacheFile('secret-id',{...file,requirementIds:['private-key']});
    assert.equal(await evidence.cachedFile('secret-id'),undefined);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("identical backend replay reuses five syntax-checked files without requests or quota waits", async (t) => {
  const directory = await mkdtemp(join(tmpdir(),'forgeweb-replay-'));
  let requests=0, waits=0;
  t.mock.method(globalThis,'fetch',async (_url: string,init: RequestInit)=>{
    requests++;
    const prompt=JSON.parse(init.body as string).messages[1].content;
    const path=prompt.match(/Return exactly ONE file: ([^ ]+)\./)[1];
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path,content:'x=1\n',requirementIds:['REQ-1']}]})}}]}));
  });
  try {
    const evidence=new GenerationEvidence(directory);
    const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'frontend-dual-gemini-backend',FORGEWEB_BACKEND_PROVIDER:'groq',GROQ_API_KEY:'test',OPENROUTER_API_KEY:'test',GEMINI_API_KEY:'test'}, {evidence,groqPacer:{async wait(){waits++;}}}) as FrontendDualGeminiBackendProvider;
    const spec={productName:'Study planner',requirements:[],architecture:{backend:{modules:[],routes:[]},data:{rules:[]}}} as unknown as MasterSpecification;
    const first=await provider.generateBackendManifest(spec);
    assert.equal(requests,5);
    const second=await provider.generateBackendManifest(spec);
    assert.deepEqual(second,first);
    assert.equal(requests,5);
    assert.equal(waits,5);
    await provider.generateBackendManifest({...spec,productName:'Changed planner'});
    assert.equal(requests,10,'Changed specification must not reuse stale source');
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("Python rejection includes the compiler reason and column, without executing source", async () => {
  const result=await validatePythonSyntax([{path:'backend/app/main.py',content:'return 1',digest:'test',requirementIds:[]}]);
  assert.equal(result.status,'failed');
  assert.match(result.evidence,/main\.py:1:\d+: invalid Python syntax: 'return' outside function/);
});
