import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeminiGenerationProvider, FrontendDualGeminiBackendProvider, createGenerationProviderFromEnv } from '../providers/generation-provider.ts';
import { GenerationEvidence } from '../providers/generation-evidence.ts';
import type { MasterSpecification } from '../domain.ts';

const spec = {productName:'StudyNest',requirements:[],architecture:{backend:{modules:[],routes:[]},data:{rules:[]}}} as unknown as MasterSpecification;
const paths = ['backend/app/models/domain.py','backend/app/schemas/contracts.py','backend/app/services/application_service.py','backend/app/api/routes.py','backend/app/main.py'];
const response = (path: string, content='x=1\n', finishReason='STOP') => new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify({files:[{path,content,requirementIds:['REQ-1']}]})}]}}]}));

test('Gemini backend uses five plain-source stages with a fixed per-file budget and handoff context',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
    const request=JSON.parse(init.body as string);
    assert.equal(request.generationConfig.maxOutputTokens,4096);
    assert.deepEqual(request.generationConfig.thinkingConfig,{thinkingLevel:'low'});
    assert.ok(request.generationConfig.responseJsonSchema.properties.files);
    assert.equal(request.generationConfig.responseJsonSchema.properties.files.minItems,1);
    assert.equal(request.generationConfig.responseJsonSchema.properties.files.maxItems,1);
    assert.deepEqual(request.generationConfig.responseJsonSchema.properties.files.items.properties.path.enum,[paths[calls]]);
    assert.equal(request.generationConfig.responseJsonSchema.properties.mainPy,undefined);
    const prompt=request.contents[0].parts[0].text;
    assert.ok(prompt.includes(`Return exactly ONE file: ${paths[calls]}`));
    if(calls>0) assert.ok(prompt.includes(paths[calls-1]),'Previous source is supplied for compatible signatures');
    return response(paths[calls++]);
  });
  const progress:string[]=[];
  const result=await new GeminiGenerationProvider('test').generateBackendManifest(spec,async(detail)=>{progress.push(detail)});
  assert.deepEqual(result.files.map(file=>file.path),paths);
  assert.equal(calls,5);
  assert.equal(progress.length,10);
});

for(const recover of [true,false]){
  test(`Gemini backend syntax repair is limited to the rejected file: recovery=${recover}`,async(t)=>{
    let calls=0;
    t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
      calls++;
      const prompt=JSON.parse(init.body as string).contents[0].parts[0].text;
      const path=prompt.match(/Return exactly ONE file: ([^ ]+)\./)[1];
      if(calls===2)assert.match(prompt,/was never closed/);
      return response(path,recover&&calls>1?'x=1\n':'raise ValueError(');
    });
    const provider=new GeminiGenerationProvider('test');
    if(recover)assert.equal((await provider.generateBackendManifest(spec)).files.length,5);
    else await assert.rejects(provider.generateBackendManifest(spec),/after one repair/);
    assert.equal(calls,recover?6:2);
  });
}

test('Gemini per-file truncation stops without doubling into another whole-bundle request',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return response(paths[0],'x=','MAX_TOKENS')});
  await assert.rejects(new GeminiGenerationProvider('test').generateBackendManifest(spec),/output token limit/);
  assert.equal(calls,1);
});

test('Gemini backend reuses syntax-checked files on an identical retry',async(t)=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-gemini-cache-'));
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>response(paths[calls++]));
  try{
    const provider=new GeminiGenerationProvider('test','test-model',new GenerationEvidence(directory));
    await provider.generateBackendManifest(spec);
    await provider.generateBackendManifest(spec);
    assert.equal(calls,5);
  }finally{await rm(directory,{recursive:true,force:true})}
});

test('Gemini-first order skips disabled slot 3 and keeps paced plain-source Groq as final fallback',async(t)=>{
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    const headers=init.headers as Record<string,string>;
    const body=JSON.parse(init.body as string);
    calls.push(url.includes('groq')?'groq':headers['x-goog-api-key']);
    if(url.includes('groq')){
      assert.equal(body.max_tokens,800);
      assert.match(body.messages[1].content,/NEVER Base64/);
    }
    return new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429});
  });
  const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'frontend-dual-gemini-backend',FORGEWEB_BACKEND_PROVIDER:'gemini',FORGEWEB_GROQ_FILE_MODE:'true',FORGEWEB_GEMINI_DISABLED_SLOTS:'3',GROQ_API_KEY:'groq',OPENROUTER_API_KEY:'router',GEMINI_API_KEY:'project1',GEMINI_FALLBACK_API_KEY_1:'project2',GEMINI_FALLBACK_API_KEY_2:'project3'},{groqPacer:{async wait(){}}}) as FrontendDualGeminiBackendProvider;
  await assert.rejects(provider.generateBackendManifest(spec),/backend generation failed/);
  assert.deepEqual(calls,['project1','project2','groq']);
});

test('live backend failure replay rejects both truncated Gemini outputs and identical invalid Groq repair',async(t)=>{
  const calls:string[]=[];
  let waits=0;
  // Sanitized source boundary captured from the live StudyNest acceptance run.
  const rejected='class Task:\n    __tablename__ = "st';
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    const headers=init.headers as Record<string,string>;
    if(!url.includes('groq')){
      calls.push(headers['x-goog-api-key']);
      return response(paths[0],'class Task:','MAX_TOKENS');
    }
    calls.push('groq');
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path:paths[0],content:rejected,requirementIds:['REQ-1']}]})}}]}));
  });
  const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'frontend-dual-gemini-backend',FORGEWEB_BACKEND_PROVIDER:'gemini',FORGEWEB_GROQ_FILE_MODE:'true',GROQ_API_KEY:'groq-test',OPENROUTER_API_KEY:'router-test',GEMINI_API_KEY:'project1',GEMINI_FALLBACK_API_KEY_1:'project2'},{groqPacer:{async wait(){waits++}}}) as FrontendDualGeminiBackendProvider;
  await assert.rejects(provider.generateBackendManifest(spec),(error:Error)=>{
    assert.match(error.message,/option 1:.*output token limit/);
    assert.match(error.message,/option 2:.*output token limit/);
    assert.match(error.message,/after one paced repair/);
    assert.match(error.message,/unterminated string literal/);
    assert.doesNotMatch(error.message,/groq-test|router-test|project1|project2/);
    return true;
  });
  assert.deepEqual(calls,['project1','project2','groq','groq']);
  assert.equal(waits,2,'The repair must retain pacing and stop after one attempt');
});

test('live frontend rejection replay preserves 413 and 402 instead of reporting DNS failure or retrying them',async(t)=>{
  const hosts:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:string)=>{
    const host=new URL(url).hostname;
    hosts.push(host);
    if(host.includes('groq'))return new Response(JSON.stringify({error:{message:'Request too large: ITPM limit 7000, requested 12352.'}}),{status:413});
    if(host.includes('openrouter'))return new Response(JSON.stringify({error:{message:'Requested 5200 tokens, can only afford 2853.'}}),{status:402});
    return new Response(JSON.stringify({candidates:[{finishReason:'SAFETY'}]}));
  });
  const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'frontend-dual-gemini-backend',FORGEWEB_GROQ_FILE_MODE:'true',GROQ_API_KEY:'groq-test',OPENROUTER_API_KEY:'router-test',GEMINI_API_KEY:'gemini-test'},{groqPacer:{async wait(){}}})!;
  const input={...spec,architecture:{...spec.architecture,frontend:{framework:'React',pages:[],components:[],motion:[]}}} as MasterSpecification;
  await assert.rejects(provider.generate(input),(error:Error)=>{
    assert.match(error.message,/React frontend generation failed/);
    assert.match(error.message,/status 413/);
    assert.match(error.message,/status 402/);
    assert.doesNotMatch(error.message,/DNS|could not be reached|groq-test|router-test|gemini-test/);
    return true;
  });
  assert.deepEqual(hosts,['api.groq.com','openrouter.ai','generativelanguage.googleapis.com']);
});
