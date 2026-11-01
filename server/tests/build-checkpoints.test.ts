import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JsonStore} from '../store.ts';
import {BuildWorkflow,generateDeterministicFiles} from '../workflow.ts';
import {digest,ApiError} from '../lib.ts';
import {FrontendDualGeminiBackendProvider} from '../providers/generation-provider.ts';
import type {ApplicationGenerationProvider} from '../providers/generation-provider.ts';
import {ProjectRuntime} from '../project-runtime.ts';

async function wait(workflow:BuildWorkflow,id:string,status:string){for(let i=0;i<1000;i++){const view=workflow.get(id);if(view.status===status)return view;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Build timeout');}

test('failed builds retain source in SQLite, expose it without creating an exportable version, and resume manually',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'forgeweb-checkpoints-'));let store=new JsonStore(directory);await store.initialize();
 try{
  const initial=new BuildWorkflow(store,0);const created=await initial.create('Build a freelancer project and task manager with persistent SQLite data.');
  const proposed=await wait(initial,created.id,'awaiting_confirmation');
  await store.mutate(state=>{state.specifications[proposed.specification!.id].generator={mode:'ai',provider:'openai',model:'mock',message:'Offline test'};});
  let calls=0;
  const provider:ApplicationGenerationProvider={id:'openai',mode:'ai',model:'mock',async plan(){throw Error('Unexpected planning call');},async generate(spec,_progress,checkpoint){calls++;const content='export const preserved = true;';await checkpoint?.([{path:'frontend/src/saved.ts',content,requirementIds:[spec.requirements[0].id],digest:digest(content)}]);throw Error('Simulated backend interruption');}};
  let workflow=new BuildWorkflow(store,0,provider);await workflow.confirm(created.id);await wait(workflow,created.id,'failed');
  assert.equal(calls,1);assert.deepEqual(workflow.get(created.id).filePaths,['frontend/src/saved.ts']);
  const saved=await workflow.checkpoints(created.id);assert.match(saved.files[0].content,/preserved/);assert.match(saved.resume.notice,/cost is unavailable/);
  assert.equal(workflow.get(created.id).project.currentVersionId,undefined);
  store.close();store=new JsonStore(directory);await store.initialize();workflow=new BuildWorkflow(store,0,provider);
  assert.equal((await workflow.checkpoints(created.id)).files.length,1);assert.equal(calls,1,'Reading saved files must not call a provider');
  await workflow.retry(created.id);await wait(workflow,created.id,'failed');assert.equal(calls,2);assert.equal((await workflow.checkpoints(created.id)).files.length,1);
  const runtime=new ProjectRuntime(workflow.workspace,directory);
  await assert.rejects(runtime.compilePartial(created.id,workflow.partialFrontend(created.id)),{code:'FRONTEND_INCOMPLETE'});
  await assert.rejects(runtime.partialAsset(created.id,'bad','../../secret'),{code:'PARTIAL_NOT_FOUND'});
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('checkpoint write failures stop provider failover before another request can spend credits',async()=>{
 let fallbackCalls=0;
 const first={id:'groq',mode:'ai',model:'mock',async generateFrontendManifest(){throw new ApiError(503,'CHECKPOINT_WRITE_FAILED','Storage unavailable');}};
 const second={...first,id:'openrouter',async generateFrontendManifest(){fallbackCalls++;return {files:[]};}};
 const provider=new FrontendDualGeminiBackendProvider([first,second] as never,[]);
 await assert.rejects(provider.generate({} as never),{code:'CHECKPOINT_WRITE_FAILED'});assert.equal(fallbackCalls,0);
});

test('failed executed verification cannot create a ready AI version or discard generated files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'forgeweb-release-gate-'));const store=new JsonStore(directory);await store.initialize();
 try{
  const initial=new BuildWorkflow(store,0);const created=await initial.create('Build a notes application with SQLite storage and CRUD.');const proposal=await wait(initial,created.id,'awaiting_confirmation');
  await store.mutate(state=>{state.specifications[proposal.specification!.id].generator={mode:'ai',provider:'openai',model:'offline',message:'Fixture only'};});
  const provider:ApplicationGenerationProvider={id:'openai',mode:'ai',model:'offline',async plan(){throw Error('Unexpected paid call');},async generate(spec){return generateDeterministicFiles(spec);}};
  const workflow=new BuildWorkflow(store,0,provider);let executions=0;workflow.workspace.setCompiler(async()=>{executions++;return {id:'fixture-verification',name:'Isolated frontend and backend verification',status:'failed',evidence:'Business endpoint /api/notes returned 503'};});
  await workflow.confirm(created.id);const failed=await wait(workflow,created.id,'failed');assert.equal(failed.error?.code,'FULL_STACK_VERIFICATION_FAILED');assert.equal(executions,1);assert.ok(failed.filePaths.length>0);assert.equal(failed.project.currentVersionId,undefined);assert.ok(failed.validationChecks.some(check=>check.status==='failed'));
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
