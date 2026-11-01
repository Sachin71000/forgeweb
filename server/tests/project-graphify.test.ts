import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectGraphify,graphifySources,graphifyHash} from '../project-graphify.ts';
import {digest} from '../lib.ts';
import {JsonStore} from '../store.ts';
import {BuildWorkflow} from '../workflow.ts';
const file=(path:string,content='export function menu() {}')=>({path,content,digest:digest(content),requirementIds:[]});

test('explicit backend paths take priority over unrelated graph matches within the same context cap',async()=>{const dir=await mkdtemp(join(tmpdir(),'graph-target-'));const previous=process.env.FORGEWEB_GRAPHIFY_ENABLED;process.env.FORGEWEB_GRAPHIFY_ENABLED='false';try{const graph=new ProjectGraphify(dir);const files=[file('frontend/src/App.tsx','x'.repeat(15000)),file('backend/app/repositories/application_repository.py','repository source'),file('backend/app/services/application_service.py','service source')];const context=await graph.context('p','v',files,'Repair backend/app/repositories/application_repository.py and backend/app/services/application_service.py.');assert.deepEqual(context.paths,['backend/app/repositories/application_repository.py','backend/app/services/application_service.py']);assert.ok(context.characters<=12000);}finally{if(previous===undefined)delete process.env.FORGEWEB_GRAPHIFY_ENABLED;else process.env.FORGEWEB_GRAPHIFY_ENABLED=previous;await rm(dir,{recursive:true,force:true});}});

test('graph sources exclude secrets, data, traversal and dependencies; hashes reflect styles',()=>{
  const files=[file('frontend/src/App.tsx'),file('frontend/src/styles.css','body{}'),file('backend/app/main.py'),file('.env'),file('backend/data/customer.json'),file('../evil.py'),file('frontend/node_modules/pkg/index.js'),file('backend/credentials.json')];
  assert.equal(graphifySources(files).length,3);
  assert.equal(graphifyHash(files),graphifyHash([...files].reverse()));
  assert.notEqual(graphifyHash(files),graphifyHash([...files,file('frontend/src/new.css','a{}')]));
});

test('local extraction is cached, deduplicated, stale-safe, bounded and includes CSS edit context',async()=>{
  const previous=process.env.FORGEWEB_GRAPHIFY_ENABLED;delete process.env.FORGEWEB_GRAPHIFY_ENABLED;
  const root=await mkdtemp(join(tmpdir(),'forgeweb-graph-test-'));let calls=0;
  const run=async(command:string,args:string[],options:any)=>{
    calls++;assert.equal(command,'graphify');assert.ok(args.includes('--code-only'));assert.equal(options.timeout,45000);assert.equal(options.env.GEMINI_API_KEY,undefined);
    const input=args[1];assert.deepEqual(await readdir(input),['frontend']);
    const output=join(args[args.indexOf('--out')+1],'graphify-out');await mkdir(output,{recursive:true});
    await writeFile(join(output,'graph.json'),JSON.stringify({nodes:[{id:'menu',label:'menu',source_file:'frontend/src/App.tsx'},{id:'api',label:'client',source_file:'frontend/src/lib/api.ts'}],links:[{source:'menu',target:'api'}]}));
    return {stdout:'',stderr:''};
  };
  try{
    const graph=new ProjectGraphify(root,run as any),files=[file('frontend/src/App.tsx'),file('frontend/src/lib/api.ts'),file('frontend/src/styles.css','body{}'),file('.env','secret')];
    const [a,b]=await Promise.all([graph.ensure('p','v',files),graph.ensure('p','v',files)]);
    assert.equal(a.status,'ready');assert.equal(b.nodes,2);assert.equal(calls,1);
    const context=await graph.context('p','v',files,'change menu background color');assert.ok(context.paths.includes('frontend/src/styles.css'));assert.ok(context.characters<=12000);assert.equal(calls,1);
    const changed=files.map(f=>f.path.endsWith('.css')?file(f.path,'body{color:red}'):f);
    await graph.ensure('p','v',changed);assert.equal(calls,2);
    await graph.ensure('p','v2',changed);assert.equal(calls,3);
  }finally{if(previous===undefined)delete process.env.FORGEWEB_GRAPHIFY_ENABLED;else process.env.FORGEWEB_GRAPHIFY_ENABLED=previous;await rm(root,{recursive:true,force:true});}
});

test('missing CLI fails safely and edits retain bounded direct source context',async()=>{
  const previous=process.env.FORGEWEB_GRAPHIFY_ENABLED;delete process.env.FORGEWEB_GRAPHIFY_ENABLED;
  const root=await mkdtemp(join(tmpdir(),'forgeweb-graph-missing-'));
  try{const graph=new ProjectGraphify(root,(async()=>{throw new Error('ENOENT private log');}) as any);
    const context=await graph.context('p','v',[file('frontend/src/App.tsx','x'.repeat(20000))],'change menu');
    assert.equal(context.status,'warning');assert.ok(context.characters<=12000);assert.deepEqual(context.paths,['frontend/src/App.tsx']);
    assert.equal((await graph.ensure('p','v',[])).message.includes('private'),false);
  }finally{if(previous===undefined)delete process.env.FORGEWEB_GRAPHIFY_ENABLED;else process.env.FORGEWEB_GRAPHIFY_ENABLED=previous;await rm(root,{recursive:true,force:true});}
});

test('generation, opening an older version, edit and restore all request local indexing',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-graph-workflow-'));const store=new JsonStore(directory);await store.initialize();const workflow=new BuildWorkflow(store,0);const indexed:string[]=[];
  workflow.workspace.graphify.ensure=async(_project,version,files)=>{indexed.push(version);return {status:'ready',message:'QA graph',sourceHash:graphifyHash(files),nodes:0,edges:0,nodesData:[],linksData:[]};};
  try{
    const created=await workflow.create('Build a client portal with projects and files.');
    const wait=async(status:string)=>{for(let i=0;i<2000;i++){const build=workflow.get(created.id);if(build.status===status)return;if(build.status==='failed')throw new Error(build.error?.message);await new Promise(r=>setTimeout(r,5));}throw new Error('Workflow timeout');};
    await wait('awaiting_confirmation');assert.equal(indexed.length,0);await workflow.confirm(created.id);await wait('completed');
    const first=await workflow.workspace.getReady(created.projectId);assert.ok(indexed.includes(first.currentVersion!.id));
    const edit=await workflow.workspace.edit(created.projectId,'Change the background color to light cream.');assert.notEqual(edit.workspace.currentVersion!.id,first.currentVersion!.id);assert.ok(indexed.includes(edit.workspace.currentVersion!.id));assert.ok(edit.editContext!.characters<=12000);
    const restored=await workflow.workspace.restore(created.projectId,first.currentVersion!.id);assert.equal(restored.currentVersion!.id,first.currentVersion!.id);assert.equal(restored.graphify!.status,'ready');
  }finally{await rm(directory,{recursive:true,force:true});}
});
