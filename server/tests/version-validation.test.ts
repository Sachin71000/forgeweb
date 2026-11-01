import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JsonStore} from '../store.ts';
import {BuildWorkflow} from '../workflow.ts';
import {ProjectRuntime} from '../project-runtime.ts';
import {versionSourceHash} from '../version-validation.ts';
import {createForgeWebServer} from '../app.ts';

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'forgeweb-validation-'));const store=new JsonStore(dir);await store.initialize();const workflow=new BuildWorkflow(store,0);const build=await workflow.create('Build a client portal for projects and files.');
  const wait=async(status:string)=>{for(let i=0;i<2000;i++){const b=workflow.get(build.id);if(b.status===status)return;if(b.status==='failed')throw new Error(b.error?.message);await new Promise(r=>setTimeout(r,5));}throw new Error('Timeout');};await wait('awaiting_confirmation');await workflow.confirm(build.id);await wait('completed');const workspace=workflow.workspace.get(build.projectId);return {dir,store,workflow,projectId:build.projectId,versionId:workspace.currentVersion!.id};}
const passed=()=>Promise.resolve({id:'compile',name:'Isolated React typecheck and build',status:'passed' as const,evidence:'Mock compiler only'});
test('pending versions require real validation results; passing source and compiler checks persist with source hash',async()=>{
 const f=await fixture();try{await f.store.mutate(d=>{d.versions[f.versionId].validationStatus='pending';});const before=f.workflow.workspace.get(f.projectId);
 const result=await f.workflow.workspace.validateVersion(f.projectId,f.versionId,passed);
 assert.equal(result.currentVersion!.validationStatus,'passed');assert.equal(result.currentVersion!.validationSourceHash,versionSourceHash(before.files));assert.ok(result.currentVersion!.validationChecks.length>=5);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('compile failures do not promote; changed version/source cannot receive stale validation evidence',async()=>{
 const f=await fixture();try{
 const failed=await f.workflow.workspace.validateVersion(f.projectId,f.versionId,async()=>({id:'bad',name:'Compiler',status:'failed',evidence:'Type error'}));assert.equal(failed.currentVersion!.validationStatus,'failed');
 await assert.rejects(f.workflow.workspace.validateVersion(f.projectId,'wrong',passed),/selected version changed/);
 await assert.rejects(f.workflow.workspace.validateVersion(f.projectId,f.versionId,async()=>{await f.store.mutate(d=>{d.versionFiles[f.versionId][0].content+='\nchanged';});return passed();}),/changed during validation/);
 assert.equal(f.workflow.workspace.get(f.projectId).currentVersion!.validationStatus,'failed');
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('ineligible or mismatched startup cannot stop an existing preview or invoke Docker',async()=>{
 const f=await fixture();try{
 const runtime=new ProjectRuntime(f.workflow.workspace,f.dir) as any;let dockerCalls=0;runtime.docker=async()=>{dockerCalls++;throw new Error('Must not call Docker');};
 const session={status:{status:'running',versionId:'older',frontendHealthy:true,backendHealthy:true},proxy:'old-proxy'};runtime.sessions.set(f.projectId,session);
 await f.store.mutate(d=>{d.versions[f.versionId].validationStatus='pending';});
 await assert.rejects(runtime.start(f.projectId,f.versionId),/validated project version/);assert.equal(runtime.sessions.get(f.projectId),session);assert.equal(dockerCalls,0);
 await assert.rejects(runtime.start(f.projectId,'wrong'),/selected version changed/);assert.equal(runtime.sessions.get(f.projectId),session);assert.equal(dockerCalls,0);
 runtime.sessions.clear();
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('runtime HTTP endpoints require a version, reject stale requests and enforce origin checks',async()=>{
 const f=await fixture();const server=createForgeWebServer(f.workflow);try{
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 const post=(path:string,data:unknown,origin=base)=>fetch(`${base}/api/projects/${f.projectId}/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
 assert.equal((await post('runtime',{})).status,400);assert.equal((await post('runtime/validate',{})).status,400);
 assert.equal((await post('runtime',{versionId:'stale'})).status,409);
 assert.equal((await post('runtime/validate',{versionId:'stale'})).status,409);
 assert.equal((await post('runtime/validate',{versionId:f.versionId},'https://untrusted.example')).status,403);
 await f.store.mutate(d=>{d.versions[f.versionId].validationStatus='pending';});assert.equal((await post('runtime',{versionId:f.versionId})).status,409);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(f.dir,{recursive:true,force:true});}
});

test('invalid API TypeScript and Python persist failed validation without calling compiler',async()=>{
 const f=await fixture();try{await f.store.mutate(d=>{const files=d.versionFiles[f.versionId];files.find(f=>f.path==='frontend/src/lib/api.ts')!.content='export interface Broken {';files.find(f=>f.path==='backend/app/main.py')!.content='def broken(:';});let compiled=false;
 const result=await f.workflow.workspace.validateVersion(f.projectId,f.versionId,async()=>{compiled=true;return passed();});assert.equal(result.currentVersion!.validationStatus,'failed');assert.equal(compiled,false);assert.ok(result.currentVersion!.validationChecks.some(c=>c.name==='Python module links'&&c.status==='failed'));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
