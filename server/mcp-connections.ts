import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ApiError} from './lib.ts';
import {downloadStitchHtml} from './providers/stitch-design.ts';
import {compactStitchReference} from './generation/master-prompt.ts';

type Configuration={id:string;name:string;url:string;tokenEnv?:string;kind:'stitch'|'supabase'|'custom'};
export type McpReference={serverId:string;kind:'stitch'|'supabase';data:string;readAt:string};
export type McpConnection={id:string;name:string;status:'not_connected'|'verified';checkedAt?:string;tools:Array<{name:string}>;kind:Configuration['kind'];reference?:McpReference;selected?:boolean};

// Only fixed design/schema reads. No SQL, writes, sampling or command spawning.
// References enter generation only after explicit selection. Endpoints are configured by the local operator,
// never accepted from a browser or a generated artifact.
export class McpConnections {
  private configurations:Configuration[]=[];
  private configurationError=false;
  private verified=new Map<string,McpConnection>();
  private busy=new Set<string>();
  private references=new Map<string,McpReference>();
  private selected=new Set<string>();
  private environment:Record<string,string|undefined>;

  constructor(environment:Record<string,string|undefined>=process.env){
    this.environment={...environment};
    try{
      const parsed:unknown=JSON.parse(environment.FORGEWEB_MCP_SERVERS??'[]');
      if(!Array.isArray(parsed)||parsed.length>8)throw new Error('configuration');
      if(environment.STITCH_API_KEY?.trim()&&!parsed.some(entry=>entry?.id==='stitch'))parsed.push({id:'stitch',name:'Google Stitch',kind:'stitch',url:'https://stitch.googleapis.com/mcp',tokenEnv:'STITCH_API_KEY'});
      if(environment.SUPABASE_MCP_PROJECT_REF?.trim()&&!parsed.some(entry=>entry?.id==='supabase')){
        if(environment.FORGEWEB_SUPABASE_ENVIRONMENT!=='development'||!environment.SUPABASE_MCP_TOKEN?.trim()||!/^[-a-z0-9]{6,64}$/.test(environment.SUPABASE_MCP_PROJECT_REF))throw new Error('configuration');
        parsed.push({id:'supabase',name:'Supabase development schema',kind:'supabase',url:`https://mcp.supabase.com/mcp?project_ref=${environment.SUPABASE_MCP_PROJECT_REF}&read_only=true&features=database`,tokenEnv:'SUPABASE_MCP_TOKEN'});
      }
      const ids=new Set<string>();
      for(const entry of parsed){
        if(!entry||typeof entry!=='object'||typeof entry.id!=='string'||!/^[-a-z0-9]{1,48}$/.test(entry.id)||ids.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>80||typeof entry.url!=='string')throw new Error('configuration');
        const url=new URL(entry.url);
        const kind=entry.kind??'custom';
        if(!['stitch','supabase','custom'].includes(kind))throw new Error('configuration');
        if(kind==='stitch'&&url.href!=='https://stitch.googleapis.com/mcp')throw new Error('configuration');
        if(kind==='supabase'&&(environment.FORGEWEB_SUPABASE_ENVIRONMENT!=='development'||url.origin!=='https://mcp.supabase.com'||url.pathname!=='/mcp'||url.searchParams.get('read_only')!=='true'||!/^[-a-z0-9]{6,64}$/.test(url.searchParams.get('project_ref')??'')||url.searchParams.get('features')!=='database'||[...url.searchParams.keys()].some(key=>!['project_ref','read_only','features'].includes(key))||[...url.searchParams.keys()].length!==3))throw new Error('configuration');
        const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
        if(url.username||url.password||url.hash||(kind!=='supabase'&&url.search)||(!loopback&&url.protocol!=='https:')||!['http:','https:'].includes(url.protocol)||['169.254.169.254','metadata.google.internal'].includes(url.hostname))throw new Error('configuration');
        if(entry.tokenEnv!==undefined&&(typeof entry.tokenEnv!=='string'||!/^[_A-Z][_A-Z0-9]{0,100}$/.test(entry.tokenEnv)||entry.tokenEnv.startsWith('VITE_')))throw new Error('configuration');
        ids.add(entry.id);
        this.configurations.push({id:entry.id,name:entry.name.trim(),url:url.href,tokenEnv:entry.tokenEnv,kind});
      }
    }catch{this.configurationError=true;this.configurations=[];}
  }

  list():McpConnection[]{
    if(this.configurationError)throw new ApiError(503,'MCP_CONFIGURATION_INVALID','Check server-side FORGEWEB_MCP_SERVERS configuration. No connection was attempted.');
    return this.configurations.map(config=>({...this.verified.get(config.id)??{id:config.id,name:config.name,status:'not_connected',tools:[],kind:config.kind},reference:this.references.get(config.id),selected:this.selected.has(config.id)}));
  }

  async connect(id:string):Promise<McpConnection>{
    this.references.delete(id);this.selected.delete(id);
    return this.session(id,async(client,config,signal)=>{
      const result=await client.listTools({}, {signal,timeout:15_000});
      if(result.nextCursor||result.tools.length>100)throw new Error('Tool inventory exceeds inspection limit');
      const connection:McpConnection={id:config.id,name:config.name,kind:config.kind,status:'verified',checkedAt:new Date().toISOString(),tools:result.tools.map(tool=>({name:tool.name.slice(0,200)}))};
      this.verified.set(id,connection);
      return connection;
    });
  }

  private async session<T>(id:string,action:(client:Client,config:Configuration,signal:AbortSignal)=>Promise<T>):Promise<T>{
    this.list();
    const config=this.configurations.find(item=>item.id===id);
    if(!config)throw new ApiError(404,'MCP_NOT_CONFIGURED','This MCP server is not configured on the backend.');
    if(this.busy.has(id))throw new ApiError(409,'MCP_BUSY','This connection check is already running.');
    const token=config.tokenEnv?this.environment[config.tokenEnv]:undefined;
    if(config.tokenEnv&&!token?.trim())throw new ApiError(503,'MCP_CREDENTIAL_MISSING','The MCP server credential is missing from the backend environment.');
    this.busy.add(id);
    this.verified.delete(id);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15_000);
    const client=new Client({name:'forgeweb-inspector',version:'1.0.0'},{capabilities:{}});
    const transport=new StreamableHTTPClientTransport(new URL(config.url),{
      reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},
      requestInit:{redirect:'error',headers:token?config.kind==='stitch'?{'X-Goog-Api-Key':token}:{authorization:`Bearer ${token}`}:{ }},
      fetch:async(input,init)=>{
        const target=typeof input==='string'?input:input.href;
        if(new URL(target).href!==config.url)throw new Error('MCP endpoint changes are not allowed');
        const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:[])])});
        if(!response.body)return response;
        let size=0;
        const stream=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,output){size+=chunk.byteLength;if(size>1024*1024)throw new Error('MCP response too large');output.enqueue(chunk);}}));
        return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
      },
    });
    try{
      await client.connect(transport,{signal:controller.signal,timeout:15_000});
      return await action(client,config,controller.signal);
    }catch{
      // Provider bodies, endpoint URLs and credentials must not reach API errors.
      throw new ApiError(502,'MCP_CONNECTION_FAILED','MCP inspection failed. Check the endpoint, authentication and Streamable HTTP support, then retry.');
    }finally{
      controller.abort();
      clearTimeout(timer);
      await client.close().catch(()=>undefined);
      this.busy.delete(id);
    }
  }

  async read(id:string,payload:unknown):Promise<McpConnection>{
    this.list();
    const config=this.configurations.find(item=>item.id===id);
    if(!config||config.kind==='custom')throw new ApiError(403,'MCP_READ_NOT_ALLOWED','Only configured Stitch references and Supabase development schemas may be read.');
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ApiError(400,'MCP_INPUT_INVALID','Expected reference selection.');
    const input=payload as Record<string,unknown>;
    if(Object.keys(input).some(key=>!['projectId','screenId'].includes(key)))throw new ApiError(400,'MCP_INPUT_INVALID','Arbitrary MCP tools and arguments are not allowed.');
    if(config.kind==='stitch'&&[input.projectId,input.screenId].some(value=>typeof value!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(value)))throw new ApiError(400,'MCP_INPUT_INVALID','Provide a Stitch project ID and screen ID.');
    if(config.kind==='supabase'&&Object.keys(input).length)throw new ApiError(400,'MCP_INPUT_INVALID','Schema reads use the configured development project only.');
    this.references.delete(id);this.selected.delete(id);
    const reference=await this.session(id,async(client,entry,signal)=>{
      const result=await client.callTool(entry.kind==='stitch'?{name:'get_screen',arguments:{name:`projects/${input.projectId}/screens/${input.screenId}`}}:{name:'list_tables',arguments:{schemas:['public'],verbose:true}},undefined,{signal,timeout:15_000});
      if(result.isError)throw new Error('MCP read failed');
      let data:unknown=result.structuredContent;
      if(!data){const text=Array.isArray(result.content)?result.content.filter(item=>item.type==='text').map(item=>'text' in item?item.text:'').join('\n'):'';data=JSON.parse(text);}
      let safeData:string;
      if(entry.kind==='stitch'){
        const screen=data as {htmlCode?:{downloadUrl?:string};html_code?:{download_url?:string}};
        const url=screen?.htmlCode?.downloadUrl??screen?.html_code?.download_url;
        if(typeof url!=='string')throw new Error('No screen HTML artifact');
        const html=await downloadStitchHtml(url,entry.tokenEnv?this.environment[entry.tokenEnv]:undefined);
        safeData=compactStitchReference(html.replace(/url\([^)]*\)/gi,'none'));
      }else safeData=publicSchemaReference(data);
      for(const [key,value] of Object.entries(this.environment))if(/KEY|TOKEN|SECRET|PASSWORD/.test(key)&&value&&value.length>=8)safeData=safeData.split(value).join('[REDACTED]');
      const reference:McpReference={serverId:id,kind:entry.kind as 'stitch'|'supabase',data:safeData,readAt:new Date().toISOString()};
      this.references.set(id,reference);
      return reference;
    });
    const connection:McpConnection={id,name:config.name,kind:config.kind,status:'verified',tools:[{name:config.kind==='stitch'?'get_screen':'list_tables'}],checkedAt:reference.readAt,reference,selected:false};
    this.verified.set(id,connection);
    return connection;
  }

  select(id:string,enabled:unknown):void{
    if(typeof enabled!=='boolean')throw new ApiError(400,'MCP_INPUT_INVALID','Selection must be true or false.');
    if(this.busy.has(id))throw new ApiError(409,'MCP_BUSY','Wait for the reference read to finish.');
    if(!this.references.has(id))throw new ApiError(409,'MCP_REFERENCE_REQUIRED','Read a reference successfully before selecting it.');
    if(enabled&&!this.selected.has(id)&&(this.selected.size>=2||this.selectedReferences().reduce((size,reference)=>size+reference.data.length,0)+(this.references.get(id)?.data.length??0)>20_000))throw new ApiError(422,'MCP_CONTEXT_LIMIT','Use at most two references with a combined context below 20,000 characters.');
    if(enabled)this.selected.add(id);else this.selected.delete(id);
  }

  selectedReferences():McpReference[]{return structuredClone([...this.references.values()].filter(reference=>this.selected.has(reference.serverId)));}

  disconnect(id:string):void{
    this.list();
    if(!this.configurations.some(item=>item.id===id))throw new ApiError(404,'MCP_NOT_CONFIGURED','This MCP server is not configured on the backend.');
    if(this.busy.has(id))throw new ApiError(409,'MCP_BUSY','Wait for the connection check to finish.');
    this.verified.delete(id);
    this.references.delete(id);this.selected.delete(id);
  }
}

// Only schema identifiers/types, never rows, SQL, defaults, comments or secrets.
export function publicSchemaReference(data:unknown):string{
  const tables=Array.isArray(data)?data:data&&typeof data==='object'&&'tables' in data?data.tables:undefined;
  if(!Array.isArray(tables))throw new Error('Unsupported schema result');
  const identifier=(value:unknown)=>typeof value==='string'?value.slice(0,120):'';
  const projected=tables.filter(table=>table&&table.schema==='public').slice(0,30).map(table=>({schema:'public',name:identifier(table.name),columns:Array.isArray(table.columns)?table.columns.slice(0,40).map((column:Record<string,unknown>)=>({name:identifier(column.name),type:identifier(column.data_type??column.format),nullable:typeof column.is_nullable==='boolean'?column.is_nullable:undefined})):[],columnsTruncated:Array.isArray(table.columns)&&table.columns.length>40}));
  const result=JSON.stringify({tables:projected,truncated:tables.length>30});
  if(result.length>16_000)throw new Error('Schema reference exceeds context limit; select a smaller development schema');
  return result;
}
