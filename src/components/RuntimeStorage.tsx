import {useEffect,useRef,useState} from 'react';
import {storageRecordFields} from '../lib/storage-records';
import {runtimeAction,validateRuntimeVersion,readStorage,getRuntime,type RuntimeStatus,type StorageView,type ProjectWorkspace} from '../lib/forgeweb-api';

export function LiveRuntime({projectId,versionId,validationStatus,checks=[],onValidated,onUrl}:{projectId:string;versionId?:string;validationStatus?:string;checks?:NonNullable<ProjectWorkspace['currentVersion']>['validationChecks'];onValidated?:(workspace:ProjectWorkspace)=>void;onUrl:(url:string)=>void}){
  const [state,setState]=useState<RuntimeStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{let active=true;setState(null);setError('');onUrl('');void getRuntime(projectId).then(value=>{if(active){setState(value);onUrl(value.status==='running'&&value.frontendHealthy&&value.backendHealthy?value.url??'':'');}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Could not check runtime status');});return()=>{active=false;};},[projectId,versionId,onUrl]);
  async function validate(){if(!versionId)return;setBusy(true);setError('');try{const workspace=await validateRuntimeVersion(projectId,versionId);if(mounted.current){onValidated?.(workspace);setState(await getRuntime(projectId));}}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Validation failed');}finally{if(mounted.current)setBusy(false);}}
  async function act(action:'start'|'stop'|'refresh'){
    setBusy(true);setError('');
    try{const value=await runtimeAction(projectId,action,versionId);if(mounted.current){setState(value);onUrl(value.status==='running'&&value.frontendHealthy&&value.backendHealthy?value.url??'':'');}}
    catch(cause){if(mounted.current){setError(cause instanceof Error?cause.message:'Runtime request failed');onUrl('');try{const latest=await getRuntime(projectId);if(mounted.current)setState(latest);}catch{if(mounted.current)setState(previous=>({...previous,status:'failed',hasSession:previous?.hasSession||action==='stop',cleanupPending:action==='stop',frontendHealthy:false,backendHealthy:false,message:'Runtime state could not be confirmed; retry health or cleanup before assuming it stopped.'}));}}}
    finally{if(mounted.current)setBusy(false);}
  }
  const healthy=state?.status==='running'&&state.frontendHealthy&&state.backendHealthy;
  const eligible=validationStatus==='passed'&&state?.eligible!==false;
  const label=healthy?'Live Vite server · FastAPI healthy':busy?'Validating / starting / checking…':state?.status==='failed'?'Live preview failed':state?.status==='starting'?'Live preview starting':!eligible?'Validation required · static preview only':'Static preview · backend not running';
  return <section className="runtime-tools" aria-label="Live project runtime">
    <div className="runtime-controls"><strong>{label}</strong>
    {!healthy&&<button type="button" className="button workspace-button" disabled={busy||!versionId} onClick={()=>void validate()}>{eligible?'Revalidate this version':'Validate this version'}</button>}
    <button type="button" className="button workspace-button" disabled={busy||(!state?.hasSession&&!healthy&&(!versionId||!eligible))} onClick={()=>void act(healthy||state?.hasSession?'stop':'start')}>{state?.cleanupPending?'Retry cleanup':healthy||state?.hasSession?'Stop live preview':'Start live preview'}</button>
    <button type="button" className="button workspace-button" disabled={busy} onClick={()=>void act('refresh')}>Check health</button>
    {healthy&&state?.url&&<a href={state.url} target="_blank" rel="noreferrer">Open live app ↗</a>}</div>
    <p>{state?.message??'Starts isolated containers; first prepare the runtime dependencies. Stops automatically after 15 minutes; SQLite data is retained.'}</p>
    <p>Selected version: {validationStatus??'loading'} · Source validation does not guarantee application workflows.</p>
    {!!checks.length&&<details><summary>Version validation checks</summary><ul>{checks.map(check=><li key={check.id}>{check.name}: {check.status}{check.status==='failed'&&<pre>{check.evidence}</pre>}</li>)}</ul></details>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}

export function StorageViewer({projectId}:{projectId:string}){
  const [app,setApp]=useState<StorageView|null>(null);
  const [control,setControl]=useState<StorageView|null>(null);
  const [collection,setCollection]=useState('');
  const [offset,setOffset]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const requestNumber=useRef(0);
  useEffect(()=>{setApp(null);setControl(null);setCollection('');setOffset(0);setError('');return()=>{requestNumber.current++;};},[projectId]);
  async function refresh(name=collection,page=offset){
    setBusy(true);setError('');
    const current=++requestNumber.current;
    const results=await Promise.allSettled([readStorage(projectId,name,page),readStorage()]);
    if(current!==requestNumber.current)return;
    if(results[0].status==='fulfilled')setApp(results[0].value);else setError(results[0].reason instanceof Error?results[0].reason.message:'Application storage is unavailable');
    if(results[1].status==='fulfilled')setControl(results[1].value);
    setBusy(false);
  }
  return <section className="storage-viewer" aria-label="SQLite storage viewer">
    <h3>Where your data is stored</h3>
    <p>Customer records and ForgeWeb history are separate SQLite databases. This viewer is read-only; sensitive field names are masked.</p>
    <button type="button" className="button workspace-button" disabled={busy} onClick={()=>void refresh()}>Refresh stored data</button>
    {error&&<p role="alert">{error}</p>}
    {control&&<div><h4>ForgeWeb history · {control.engine}</h4><code>{control.location}</code><p>{control.note}</p><ul>{control.tables?.map(table=><li key={table.name}>{table.name}: {table.count} rows</li>)}</ul></div>}
    {app&&<div><h4>Customer application · {app.engine}</h4><code>{app.location}</code><p>{app.message}</p>
      <label>Collection <select aria-label="Stored collection" value={collection} onChange={event=>{setCollection(event.target.value);setOffset(0);void refresh(event.target.value,0);}}><option value="">Select collection</option>{app.collections?.map(table=><option key={table.name} value={table.name}>{table.name} ({table.count})</option>)}</select></label>
      {!!app.rows?.length ? <ol className="storage-records" start={offset+1} aria-label="Saved records">{app.rows.map((row,index)=><li key={offset+index}><article><h5>Record {offset+index+1}</h5><dl>{storageRecordFields(row).map(({label,value},field)=><div key={field}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article></li>)}</ol> : <p role="status">{collection?'No saved records in this collection.':'Select a collection to view its saved records.'}</p>}
      <p>{app.total??0} records · page {Math.floor(offset/25)+1}</p>
      <button type="button" disabled={busy||offset===0} onClick={()=>{setOffset(offset-25);void refresh(collection,offset-25);}}>Previous</button>
      <button type="button" disabled={busy||offset+25>=(app.total??0)} onClick={()=>{setOffset(offset+25);void refresh(collection,offset+25);}}>Next</button>
    </div>}
  </section>;
}
