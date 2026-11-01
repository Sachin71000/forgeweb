import {Plug,Unplug,LoaderCircle,ChevronDown} from 'lucide-react';
import {useState} from 'react';
import {listMcpServers,inspectMcpServer,disconnectMcpServer,readMcpReference,selectMcpReference,type McpServer} from '../lib/forgeweb-api';

export default function McpConnections(){
  const [open,setOpen]=useState(false);
  const [servers,setServers]=useState<McpServer[]>([]);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [projectId,setProjectId]=useState('');
  const [screenId,setScreenId]=useState('');
  async function load(){
    setBusy('list');setError('');
    try{setServers(await listMcpServers());}catch(cause){setError(cause instanceof Error?cause.message:'MCP servers could not be loaded.');}finally{setBusy('');}
  }
  async function change(server:McpServer){
    setBusy(server.id);setError('');
    try{
      if(server.status==='verified'){
        await disconnectMcpServer(server.id);
        setServers(current=>current.map(item=>item.id===server.id?{...item,status:'not_connected',tools:[],checkedAt:undefined,reference:undefined,selected:false}:item));
      }else{
        const inspected=await inspectMcpServer(server.id);
        setServers(current=>current.map(item=>item.id===server.id?inspected:item));
      }
    }catch(cause){setError(cause instanceof Error?cause.message:'MCP inspection failed.');await listMcpServers().then(setServers).catch(()=>undefined);}finally{setBusy('');}
  }
  async function read(server:McpServer){
    setBusy(server.id);setError('');
    try{const updated=await readMcpReference(server.id,server.kind==='stitch'?{projectId,screenId}:{});setServers(current=>current.map(item=>item.id===server.id?updated:item));}
    catch(cause){setError(cause instanceof Error?cause.message:'Reference read failed.');await listMcpServers().then(setServers).catch(()=>undefined);}finally{setBusy('');}
  }
  async function select(server:McpServer){
    setBusy(server.id);setError('');
    try{setServers(await selectMcpReference(server.id,!server.selected));}catch(cause){setError(cause instanceof Error?cause.message:'Reference selection failed.');}finally{setBusy('');}
  }
  return <section className="mcp-connections">
    <button type="button" className="mcp-toggle" aria-expanded={open} aria-controls="mcp-connection-panel" onClick={()=>{setOpen(!open);if(!open)void load();}}><Plug/> Connect MCP <ChevronDown/></button>
    {open&&<div id="mcp-connection-panel" className="mcp-panel">
      <p>Read-only Stitch design references and Supabase development schemas. No database writes or publishing. Your build flow stays unchanged.</p>
      {error&&<p role="alert" className="mcp-error">{error}</p>}
      {busy==='list'&&<p role="status"><LoaderCircle className="animate-spin"/> Loading servers…</p>}
      {!busy&&!servers.length&&!error&&<p>No servers configured. Add <code>FORGEWEB_MCP_SERVERS</code> to the server’s <code>.env.local</code>, then restart. Keep tokens server-side.</p>}
      {servers.map(server=><article key={server.id}>
        <strong>{server.name}</strong><small>{server.status==='verified'?'Verified tool inventory · inspection session closed':'Not connected'}</small>
        <button type="button" disabled={Boolean(busy)} onClick={()=>void change(server)}>{busy===server.id?<LoaderCircle className="animate-spin"/>:server.status==='verified'?<Unplug/>:<Plug/>}{server.status==='verified'?'Disconnect':'Connect & inspect'}</button>
        {server.status==='verified'&&<ul aria-label={`${server.name} tools`}>{server.tools.length?server.tools.map(tool=><li key={tool.name}>{tool.name}</li>):<li>No tools advertised.</li>}</ul>}
        {server.kind==='stitch'&&<><label>Stitch project ID<input value={projectId} onChange={event=>setProjectId(event.target.value)} autoComplete="off"/></label><label>Stitch screen ID<input value={screenId} onChange={event=>setScreenId(event.target.value)} autoComplete="off"/></label></>}
        {server.kind!=='custom'&&<button type="button" disabled={Boolean(busy)||(server.kind==='stitch'&&(!projectId.trim()||!screenId.trim()))} onClick={()=>void read(server)}>{server.kind==='stitch'?'Read screen reference':'Read public schema'}</button>}
        {server.reference&&<><pre aria-label={`${server.name} reference`}>{server.reference.data}</pre><p>Selected references are sent to your configured generation providers for new builds. Credentials and database rows are excluded.</p><button type="button" disabled={Boolean(busy)} aria-pressed={Boolean(server.selected)} onClick={()=>void select(server)}>{server.selected?'Stop using in new builds':'Use in new builds'}</button></>}
      </article>)}
      <button type="button" disabled={Boolean(busy)} onClick={()=>void load()}>Refresh MCP servers</button>
    </div>}
  </section>;
}
