import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compactStitchReference,frontendImplementationPrompt} from '../generation/master-prompt.ts';
import {GenerationEvidence} from '../providers/generation-evidence.ts';
import {GeminiGenerationProvider,createGenerationProviderFromEnv} from '../providers/generation-provider.ts';
import type {MasterSpecification} from '../domain.ts';

const spec={productName:'StudyNest',prompt:'Build a cream planner',requirements:[{id:'REQ-1'}],architecture:{frontend:{pages:[],components:[]},backend:{routes:[]},data:{rules:[]}}} as unknown as MasterSpecification;
const frontend=['package.json','INTERACTIONS.md','frontend/src/App.tsx','frontend/src/main.tsx','frontend/src/styles.css','frontend/src/lib/api.ts','frontend/src/pages/Tasks.tsx','frontend/src/components/Task.tsx'].map(path=>({path,content:path==='package.json'?JSON.stringify({scripts:{dev:'vite',build:'tsc'},devDependencies:{vite:'8.2.4'}}):'// received source',requirementIds:['REQ-1']}));
const preview={path:'frontend/preview.html',content:'<!doctype html><html><body><header>StudyNest forgeweb-ai-generated-v1</header><main><button data-action="new">New</button></main><script>document.querySelector("button").onclick=()=>{};</script></body></html>',requirementIds:['REQ-1']};

test('Stitch visual evidence stays bounded and strips scripts, SVG geometry and asset URLs',()=>{
  const html='<style>body{background:#fff8ed;display:grid;gap:12px}</style><script>PRIVATE_SCRIPT()</script><svg><path d="'+ 'M1 '.repeat(20000)+'"/></svg><main class="grid"><h1>StudyNest</h1><button>New task</button><img src="https://private.test/a?token=SECRET"/></main>';
  const compact=compactStitchReference(html);
  assert.ok(compact.length<=4200);
  assert.match(compact,/#fff8ed/);
  assert.match(compact,/StudyNest|New task/);
  assert.doesNotMatch(compact,/PRIVATE_SCRIPT|M1|SECRET|private\.test/);
  const prompt=frontendImplementationPrompt({...spec,stitchDesign:{html} as MasterSpecification['stitchDesign']});
  assert.ok(prompt.length<15000);
});

test('Gemini frontend checkpoint survives a new provider instance and invalidates for a changed prompt or design',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-frontend-checkpoint-'));
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    const files=calls++%2===0?frontend:[preview];
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files})}]}}],usageMetadata:{promptTokenCount:123,candidatesTokenCount:45,thoughtsTokenCount:67,totalTokenCount:235,untrusted:'PRIVATE'}}));
  });
  try{
    const evidence=new GenerationEvidence(directory);
    const first=await new GeminiGenerationProvider('test-key','gemini-3-flash-preview',evidence).generateFrontendManifest(spec);
    const resumed=await new GeminiGenerationProvider('test-key','gemini-3-flash-preview',evidence).generateFrontendManifest(spec);
    assert.deepEqual(resumed,first);
    assert.equal(calls,2,'Backend retry must not repeat received frontend requests');
    const checkpointOnly={...spec,stitchRequest:{projectId:'stitch-qa',generationStarted:true}} as MasterSpecification;
    assert.deepEqual(await new GeminiGenerationProvider('test-key','gemini-3-flash-preview',evidence).cachedFrontendManifest(checkpointOnly),first);
    assert.equal(calls,2,'Stitch transport metadata must not invalidate unchanged frontend inputs');
    await new GeminiGenerationProvider('test-key','gemini-3-flash-preview',evidence).generateFrontendManifest({...spec,prompt:'Changed planner'});
    assert.equal(calls,4);
    await new GeminiGenerationProvider('test-key','gemini-3-flash-preview',evidence).generateFrontendManifest({...spec,stitchDesign:{html:'<main>New design</main>'} as MasterSpecification['stitchDesign']});
    assert.equal(calls,6);
    const names=await readdir(join(directory,'generation-diagnostics'));
    const record=JSON.parse(await readFile(join(directory,'generation-diagnostics',names[0]),'utf8'));
    assert.deepEqual(record.usage,{promptTokenCount:123,candidatesTokenCount:45,thoughtsTokenCount:67,totalTokenCount:235});
    assert.doesNotMatch(JSON.stringify(record),/PRIVATE/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('oversized Groq request is rejected before network or quota waiting',async(t)=>{
  let waits=0,calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{}')});
  const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'groq',FORGEWEB_GROQ_FILE_MODE:'true',GROQ_API_KEY:'test'},{groqPacer:{async wait(){waits++}}})!;
  await assert.rejects(provider.plan('x'.repeat(50000),spec),/local input estimate/);
  assert.equal(calls,0);
  assert.equal(waits,0);
});

test('invalid preview stops before Python generation instead of spending backend requests',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    const files=calls++===0?frontend:[{...preview,content:'<!doctype html><html><body><header>StudyNest</header><main><a href="#">Tasks</a></main></body></html>'}];
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files})}]}}]}));
  });
  await assert.rejects(new GeminiGenerationProvider('test-key').generate(spec),/Backend generation was not started/);
  assert.equal(calls,3,'Only one extra preview repair is permitted; backend is not called');
});

test('frontend source is reused after a preview-only failure and the repair does not regenerate React',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-preview-only-'));
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
    const prompt=JSON.parse(init.body as string).contents[0].parts[0].text;
    calls++;
    if(calls===1)return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files:frontend})}]}}]}));
    assert.match(prompt,/Generate only frontend\/preview.html/);
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files:[calls<4?{...preview,content:'<html>broken</html>'}:preview]})}]}}]}));
  });
  try{
    const evidence=new GenerationEvidence(directory);
    await assert.rejects(new GeminiGenerationProvider('test-key','test-model',evidence).generateFrontendManifest(spec),/preview-only repair/);
    const received=await new GeminiGenerationProvider('test-key','test-model',evidence).generateFrontendManifest(spec);
    assert.equal(received.files.length,9);assert.equal(calls,4,'Second attempt requests preview only, with source recovered locally');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('semantic nav-only preview is valid without forcing a redundant header wrapper',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    const files=calls++===0?frontend:[{...preview,content:'  '+preview.content.replaceAll('<header>','<nav>').replaceAll('</header>','</nav>').replace('data-action=','data-action = ')}];
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files})}]}}]}));
  });
  assert.equal((await new GeminiGenerationProvider('test-key').generateFrontendManifest(spec)).files.length,9);
  assert.equal(calls,2,'Valid semantic navigation should not spend an unnecessary repair');
});

test('preview CDN dependency triggers only a preview repair and is never accepted as a styled standalone page',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    const files=calls++===0?frontend:[{...preview,content:preview.content.replace('</body>','<script src="https://cdn.tailwindcss.com"></script></body>')}];
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({files})}]}}]}));
  });
  await assert.rejects(new GeminiGenerationProvider('test-key').generateFrontendManifest(spec),/preview-only repair/);
  assert.equal(calls,3);
});
