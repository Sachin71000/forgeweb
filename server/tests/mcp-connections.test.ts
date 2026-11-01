import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {McpConnections,publicSchemaReference} from '../mcp-connections.ts';

test('MCP configuration rejects browser URLs, insecure remote endpoints and exposed credential names',()=>{
  for(const url of ['http://example.com/mcp','https://user:password@example.com/mcp','https://example.com/mcp?token=secret','http://169.254.169.254/mcp','file:///tmp/server']){
    assert.throws(()=>new McpConnections({FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'design',name:'Design',url}])}).list(),/server-side/);
  }
  assert.throws(()=>new McpConnections({FORGEWEB_MCP_SERVERS:'not json SECRET'}).list(),error=>{assert.doesNotMatch(String(error),/SECRET/);return true;});
  assert.throws(()=>new McpConnections({FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'design',name:'Design',url:'https://example.com/mcp',tokenEnv:'VITE_SECRET'}])}).list());
  assert.deepEqual(new McpConnections({}).list(),[]);
});

test('unknown servers and absent credentials cause no network request',async(t)=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('unexpected network')});
  const manager=new McpConnections({FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'design',name:'Design',url:'https://example.com/mcp',tokenEnv:'DESIGN_TOKEN'}])});
  await assert.rejects(manager.connect('unknown'),/not configured/);
  await assert.rejects(manager.connect('design'),/credential is missing/);
  assert.equal(calls,0);
  assert.doesNotMatch(JSON.stringify(manager.list()),/example.com|DESIGN_TOKEN/);
});

test('real MCP handshake lists tools, sends only inspection methods, clears inventory and keeps tokens private',async()=>{
  const methods:string[]=[];
  const fixture=createServer(async(request,response)=>{
    if(request.method==='GET'){response.writeHead(405).end();return;}
    const chunks=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
    const message=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(request.headers.authorization,'Bearer private-token');
    methods.push(message.method);
    if(message.id===undefined){response.writeHead(202).end();return;}
    const result=message.method==='initialize'?{protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'qa-mcp',version:'1'}}:
      {tools:[{name:'design_reference',description:'Untrusted tool description',inputSchema:{type:'object'}}]};
    response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  });
  await new Promise<void>(resolve=>fixture.listen(0,'127.0.0.1',resolve));
  try{
    const port=(fixture.address() as AddressInfo).port;
    const manager=new McpConnections({FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'design',name:'Design tools',url:`http://127.0.0.1:${port}/mcp`,tokenEnv:'DESIGN_TOKEN'}]),DESIGN_TOKEN:'private-token'});
    const results=await Promise.allSettled([manager.connect('design'),manager.connect('design')]);
    assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
    assert.equal(manager.list()[0].status,'verified');
    assert.deepEqual(manager.list()[0].tools,[{name:'design_reference'}]);
    assert.doesNotMatch(JSON.stringify(manager.list()),/private-token|Untrusted tool description|127.0.0.1/);
    assert.deepEqual(methods.filter(method=>method!=='notifications/initialized'),['initialize','tools/list']);
    manager.disconnect('design');assert.equal(manager.list()[0].status,'not_connected');
  }finally{fixture.closeAllConnections();await new Promise<void>(resolve=>fixture.close(()=>resolve()));}
});

test('MCP transport failures redact provider bodies and credentials',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('SECRET-TOKEN backend traceback',{status:401}));
  const manager=new McpConnections({FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'design',name:'Design',url:'https://example.com/mcp'}])});
  await assert.rejects(manager.connect('design'),error=>{assert.match(String(error),/inspection failed/);assert.doesNotMatch(String(error),/SECRET|traceback|example.com/);return true;});
  assert.equal(manager.list()[0].status,'not_connected');
});

test('schema projection never includes row data, defaults, comments, or non-public tables',()=>{
  const result=JSON.parse(publicSchemaReference([{schema:'auth',name:'users',rows:[{email:'secret'}]},{schema:'public',name:'tasks',rows:[{title:'PRIVATE'}],comment:'SECRET',columns:[{name:'title',data_type:'text',default_value:'TOKEN',is_nullable:false}]}]));
  assert.deepEqual(result.tables,[{schema:'public',name:'tasks',columns:[{name:'title',type:'text',nullable:false}],columnsTruncated:false}]);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|TOKEN|email|auth/);
  assert.throws(()=>publicSchemaReference({unknown:[]}),/Unsupported/);
});

test('Supabase presets require development scope, explicit read-only mode, and reject unsafe configuration',()=>{
  assert.throws(()=>new McpConnections({SUPABASE_MCP_PROJECT_REF:'development123',SUPABASE_MCP_TOKEN:'private',FORGEWEB_SUPABASE_ENVIRONMENT:'production'}).list());
  for(const suffix of ['?project_ref=development123&read_only=false&features=database','?project_ref=development123&read_only=true&features=database&skip_elicitations=execute_sql']){
    assert.throws(()=>new McpConnections({FORGEWEB_SUPABASE_ENVIRONMENT:'development',FORGEWEB_MCP_SERVERS:JSON.stringify([{id:'db',name:'DB',kind:'supabase',url:'https://mcp.supabase.com/mcp'+suffix}])}).list());
  }
});

test('read-only Supabase integration issues only list_tables and requires selection before generation context',async(t)=>{
  const methods:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:string|URL,init?:RequestInit)=>{
    const target=new URL(String(input));
    assert.equal(target.hostname,'mcp.supabase.com');assert.equal(target.searchParams.get('read_only'),'true');assert.equal(target.searchParams.get('project_ref'),'development123');
    if(init?.method==='GET')return new Response(null,{status:405});
    const message=JSON.parse(init?.body as string);methods.push(message.method);
    if(message.id===undefined)return new Response(null,{status:202});
    let result;
    if(message.method==='initialize')result={protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}};
    else{
      assert.equal(message.method,'tools/call');assert.equal(message.params.name,'list_tables');assert.deepEqual(message.params.arguments,{schemas:['public'],verbose:true});
      result={content:[],structuredContent:{tables:[{schema:'public',name:'tasks',columns:[{name:'title',data_type:'text'}],rows:[{title:'PRIVATE ROW'}]}]}};
    }
    return Response.json({jsonrpc:'2.0',id:message.id,result});
  });
  const manager=new McpConnections({SUPABASE_MCP_PROJECT_REF:'development123',SUPABASE_MCP_TOKEN:'private-token',FORGEWEB_SUPABASE_ENVIRONMENT:'development'});
  assert.deepEqual(manager.selectedReferences(),[]);
  await assert.rejects(manager.read('supabase',{tool:'execute_sql',sql:'DROP TABLE tasks'}),/Arbitrary/);
  assert.equal(methods.length,0);
  const read=await manager.read('supabase',{});assert.equal(read.selected,false);assert.doesNotMatch(read.reference!.data,/PRIVATE ROW/);
  assert.deepEqual(manager.selectedReferences(),[]);
  manager.select('supabase',true);assert.match(manager.selectedReferences()[0].data,/tasks/);
  const copy=manager.selectedReferences();copy[0].data='mutated';assert.notEqual(manager.selectedReferences()[0].data,'mutated');
  manager.disconnect('supabase');assert.deepEqual(manager.selectedReferences(),[]);
  assert.deepEqual(methods.filter(method=>!method.startsWith('notifications/')),['initialize','tools/call']);
});

test('Stitch read uses get_screen only, isolates API-key headers and strips asset URLs before reference selection',async(t)=>{
  const tools:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:string|URL,init?:RequestInit)=>{
    const target=new URL(String(input));
    if(target.hostname==='assets.googleusercontent.com'){
      assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'),null);
      return new Response('<html><head><style>body{background:url(https://private.test/token=PRIVATE);color:#fff8ed}</style></head><body><main>Design sample</main></body></html>');
    }
    assert.equal(target.href,'https://stitch.googleapis.com/mcp');
    assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'),'private-key');
    if(init?.method==='GET')return new Response(null,{status:405});
    const message=JSON.parse(init?.body as string);
    if(message.id===undefined)return new Response(null,{status:202});
    const result=message.method==='initialize'?{protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}}:
      {content:[],structuredContent:{htmlCode:{downloadUrl:'https://assets.googleusercontent.com/design'}}};
    if(message.method==='tools/call'){tools.push(message.params.name);assert.deepEqual(message.params.arguments,{name:'projects/project123/screens/screen123'});}
    return Response.json({jsonrpc:'2.0',id:message.id,result});
  });
  const manager=new McpConnections({STITCH_API_KEY:'private-key'});
  await assert.rejects(manager.read('stitch',{projectId:'../bad',screenId:'screen123'}),/project ID/);
  const result=await manager.read('stitch',{projectId:'project123',screenId:'screen123'});
  assert.deepEqual(tools,['get_screen']);assert.match(result.reference!.data,/#fff8ed/);assert.doesNotMatch(result.reference!.data,/PRIVATE|private-key|private.test/);
});
