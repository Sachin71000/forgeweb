import assert from 'node:assert/strict';
import test from 'node:test';
import {createGenerationProviderFromEnv} from '../providers/generation-provider.ts';
import type {MasterSpecification} from '../domain.ts';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GenerationEvidence} from '../providers/generation-evidence.ts';

const environment={FORGEWEB_FREELLMAPI_ENABLED:'true',FREELLMAPI_API_KEY:'private-unified-test-key'};
const spec={projectId:'gateway-test',requirements:[],roles:[],entities:[]} as unknown as MasterSpecification;

test('gateway opt-in uses auto, bearer auth and the local chat endpoint without redirects',async(t)=>{
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    assert.equal(url,'http://127.0.0.1:3001/v1/chat/completions');
    assert.equal((init.headers as Record<string,string>).authorization,'Bearer private-unified-test-key');
    assert.equal(init.redirect,'error');
    const body=JSON.parse(init.body as string);
    assert.equal(body.model,'auto');
    assert.equal(body.response_format.type,'json_schema');
    assert.match(body.messages[1].content,/CUSTOMER PROMPT/);
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"productName":"Gateway cafe"}'}}]});
  });
  const provider=createGenerationProviderFromEnv({...environment,FORGEWEB_GENERATION_MODE:'frontend-dual-gemini-backend'})!;
  assert.equal(provider.id,'freellmapi');
  assert.equal((await provider.plan('Build a cafe',spec)).productName,'Gateway cafe');
});

test('gateway retries only the truncated file with a bounded larger budget and reuses completed Python files',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-gateway-test-'));
  try {
    const requests:Array<{path:string;budget:number}>=[];
    t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(init.body as string);
      const path=body.response_format.json_schema.schema.properties.files.items.properties.path.enum[0];
      requests.push({path,budget:body.max_tokens});
      assert.match(body.messages[1].content,/NEVER Base64/);
      if(requests.length===2)return Response.json({choices:[{finish_reason:'length',message:{content:'{"files":['}}]});
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path,content:'value = 1\n',requirementIds:['REQ-1']}]})}}]});
    });
    const provider=createGenerationProviderFromEnv(environment,{evidence:new GenerationEvidence(directory)}) as unknown as {
      generateBackendManifest(spec:MasterSpecification,onProgress:(detail:string)=>Promise<void>):Promise<{files:Array<{path:string}>}>;
    };
    const input={requirements:[{id:'REQ-1'}],architecture:{backend:{modules:[],routes:[]},data:{rules:[]},security:[]}} as unknown as MasterSpecification;
    const progress:string[]=[];
    const first=await provider.generateBackendManifest(input,async detail=>{progress.push(detail);});
    assert.equal(first.files.length,5);
    assert.equal(requests.length,6);
    assert.deepEqual(requests.slice(1,3).map(r=>r.budget),[3200,6400]);
    assert.equal(requests[1].path,requests[2].path);
    assert.equal(requests.filter(r=>r.path===requests[0].path).length,1);
    assert.ok(progress.some(detail=>detail.includes('Retrying only')));
    await provider.generateBackendManifest(input,async()=>{});
    assert.equal(requests.length,6,'An identical retry must reuse checked source instead of regenerating it');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('gateway frontend requests one file at a time with a separate preview budget',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-gateway-frontend-test-'));
  try {
    const requests:Array<{path:string;budget:number}>=[];
    t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(init.body as string);
      const path=body.response_format.json_schema.schema.properties.files.items.properties.path.enum[0];
      requests.push({path,budget:body.max_tokens});
      const content=path==='package.json'?JSON.stringify({scripts:{dev:'vite',build:'tsc'},devDependencies:{vite:'8.2.4'}}):path.endsWith('.tsx')?'export default function Page(){return <main>Test</main>}':path.endsWith('.ts')?'export const api = {};':'Test content';
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path,content,requirementIds:['REQ-1']}]})}}]});
    });
    const provider=createGenerationProviderFromEnv(environment,{evidence:new GenerationEvidence(directory)}) as unknown as {
      generateFrontendManifest(spec:MasterSpecification):Promise<{files:Array<{path:string}>}>;
    };
    const input={productName:'Test',requirements:[{id:'REQ-1'}],architecture:{frontend:{pages:[],components:[]},backend:{routes:[]}}} as unknown as MasterSpecification;
    assert.equal((await provider.generateFrontendManifest(input)).files.length,9);
    assert.equal(requests.length,9);
    assert.equal(requests.at(-1)?.path,'frontend/preview.html');
    assert.equal(requests.at(-1)?.budget,4800);
    assert.ok(requests.slice(0,-1).every(r=>r.budget===3200));
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('gateway requires a key and rejects remote endpoints and embedded credentials',()=>{
  assert.throws(()=>createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'freellmapi'}),/requires FREELLMAPI_API_KEY/);
  for(const url of ['https://example.com/v1','http://127.0.0.1.evil.test/v1','http://key@localhost/v1','http://localhost/v1?key=x','file:///v1','http://localhost/admin']){
    assert.throws(()=>createGenerationProviderFromEnv({...environment,FREELLMAPI_BASE_URL:url}),/loopback HTTP URL/);
  }
});

test('disabling gateway preserves direct provider selection and deterministic mode',()=>{
  assert.equal(createGenerationProviderFromEnv({...environment,FORGEWEB_FREELLMAPI_ENABLED:'false',GROQ_API_KEY:'test'})?.id,'groq');
  assert.equal(createGenerationProviderFromEnv({...environment,FORGEWEB_GENERATION_MODE:'deterministic'}),undefined);
});

for(const failure of ['invalid','truncated','unauthorized'])test(`gateway rejects ${failure} output without accepting incomplete code or exposing its key`,async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return failure==='unauthorized'
    ? new Response('private-unified-test-key',{status:401})
    : Response.json({choices:[{finish_reason:failure==='truncated'?'length':'stop',message:{content:'not JSON'}}]});});
  await assert.rejects(createGenerationProviderFromEnv(environment)!.plan('Build a cafe',spec),(error:Error)=>{
    assert.ok(!error.message.includes('private-unified-test-key'));
    assert.match(error.message,/invalid structured output|output limit|status 401/);
    return true;
  });
  assert.equal(calls,failure==='unauthorized'?1:2,'Only malformed/truncated output may receive one output repair');
});

test('gateway quota failure is not repaired as output and a retry resumes checked predecessors',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-gateway-resume-test-'));
  try {
    const requests:string[]=[];
    t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(init.body as string);
      const path=body.response_format.json_schema.schema.properties.files.items.properties.path.enum[0];
      requests.push(path);
      if(requests.length===2)return new Response('{"error":{"message":"Rate limited"}}',{status:429});
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path,content:'value = 1\n',requirementIds:['REQ-1']}]})}}]});
    });
    const provider=createGenerationProviderFromEnv(environment,{evidence:new GenerationEvidence(directory)}) as unknown as {
      generateBackendManifest(spec:MasterSpecification):Promise<unknown>;
    };
    const input={requirements:[{id:'REQ-1'}],architecture:{backend:{modules:[],routes:[]},data:{rules:[]},security:[]}} as unknown as MasterSpecification;
    await assert.rejects(provider.generateBackendManifest(input),/backend\/app\/schemas\/contracts.py:.*status 429/);
    assert.equal(requests.length,2);
    await provider.generateBackendManifest(input);
    assert.equal(requests.length,6);
    assert.equal(requests.filter(path=>path===requests[0]).length,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
