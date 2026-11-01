import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {McpConnections} from '../mcp-connections.ts';
import {createForgeWebServer} from '../app.ts';
import {BuildWorkflow} from '../workflow.ts';
import {JsonStore} from '../store.ts';

test('MCP HTTP mutations obey origin boundary and only selected server-side references reach a new approval-gated architecture',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'forgeweb-mcp-http-'));
  const store=new JsonStore(directory);await store.initialize();
  const workflow=new BuildWorkflow(store,0);
  const reference={serverId:'schema',kind:'supabase' as const,data:'{"tables":[{"name":"tasks"}]}',readAt:new Date().toISOString()};
  class SelectedFixture extends McpConnections{override selectedReferences(){return [reference];}}
  const manager=new SelectedFixture({});
  const server=createForgeWebServer(workflow,manager);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{
    assert.equal((await fetch(base+'/api/mcp')).status,200);
    for(const path of ['/api/mcp/design/connect','/api/mcp/design/read','/api/mcp/design/select']){
      assert.equal((await fetch(base+path,{method:'POST',headers:{origin:'https://evil.test'}})).status,403);
    }
    assert.equal((await fetch(base+'/api/mcp/design',{method:'DELETE',headers:{origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(base+'/api/mcp/design/connect',{method:'POST'})).status,404);
    assert.equal((await fetch(base+'/api/mcp/design/call',{method:'POST'})).status,404);
    assert.equal((await fetch(base+'/api/mcp/design/select',{method:'POST',headers:{'content-type':'application/json'},body:'{"enabled":"yes"}'})).status,400);
    assert.equal((await fetch(base+'/api/mcp/design/read',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})).status,400);
    const response=await fetch(base+'/api/builds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'Build a small public portfolio for a designer with projects and a contact form.',mcpReferences:[{data:'BROWSER INJECTION'}]})});
    assert.equal(response.status,202);
    const initial=await response.json() as {build:{id:string}};
    for(let attempt=0;attempt<200&&workflow.get(initial.build.id).status!=='awaiting_confirmation';attempt++)await new Promise(resolve=>setTimeout(resolve,5));
    const build=workflow.get(initial.build.id);
    assert.equal(build.status,'awaiting_confirmation');assert.equal(build.filePaths.length,0);
    assert.deepEqual(build.specification?.mcpReferences,[reference]);
    assert.doesNotMatch(JSON.stringify(build.specification),/BROWSER INJECTION/);
    assert.match(build.specification!.prompt,/portfolio/);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
