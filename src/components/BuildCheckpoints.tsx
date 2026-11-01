import {useEffect,useState} from 'react';
import type {BuildResponse} from '../lib/forgeweb-api';

type Checkpoints={files:{path:string;content:string}[];graph?:{message:string};resume:{nextStage:string;notice:string}};
export default function BuildCheckpoints({build,onUpdated}:{build:BuildResponse;onUpdated?:(build:BuildResponse)=>void}){
 const [data,setData]=useState<Checkpoints>(),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [preview,setPreview]=useState('');
 useEffect(()=>setPreview(''),[build.id,build.filePaths.length]);
 const compile=async()=>{setBusy(true);setError('');setPreview('');try{const response=await fetch(`/api/builds/${encodeURIComponent(build.id)}/partial-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw Error(result.error?.message??'Frontend compilation failed.');setPreview(result.url);}catch(value){setError(value instanceof Error?value.message:'Preview failed.');}finally{setBusy(false);}};
 useEffect(()=>{const controller=new AbortController();fetch(`/api/builds/${encodeURIComponent(build.id)}/checkpoints`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Saved progress could not be loaded.');return response.json();}).then(setData).catch(value=>{if(!controller.signal.aborted)setError(String(value.message));});return()=>controller.abort();},[build.id,build.filePaths.length,build.status]);
 const resume=async()=>{
  if(!data||!window.confirm(`${data.resume.nextStage}\n\n${data.resume.notice}\n\nContinue with provider calls?`))return;
  setBusy(true);setError('');
  try{const response=await fetch(`/api/builds/${encodeURIComponent(build.id)}/retry`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw Error(result.error?.message??'Resume failed.');onUpdated?.(result.build);}catch(value){setError(value instanceof Error?value.message:'Resume failed.');}finally{setBusy(false);}
 };
 const file=data?.files.find(value=>value.path===selected);
 return <section aria-label="Saved generation progress" className="build-proposal-section build-checkpoints">
  <h3>Saved progress · not yet verified</h3>
  <p>Completed source remains available below. This is not a validated full-stack build. Preview and export remain gated by validation.</p>
  {build.error&&<p role="alert">{build.error.message}</p>}
  <p>{data?.graph?.message}</p>
  <label>Saved file <select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a file</option>{data?.files.map(value=><option key={value.path} value={value.path}>{value.path}</option>)}</select></label>
  {file&&<pre tabIndex={0} style={{maxHeight:450,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{file.content}</pre>}
  <p>Frontend-only preview requires Docker and a successful React compilation. Backend requests are disabled.</p>
  <button className="button workspace-button" type="button" disabled={busy||!data?.files.some(value=>value.path==='frontend/src/main.tsx')} onClick={()=>void compile()}>{busy?'Working…':'Compile partial frontend preview'}</button>
  {preview&&<><p role="status">Compiled frontend only · backend incomplete · not export-ready</p><iframe title="Compiled partial frontend — backend disabled" src={preview} sandbox="allow-scripts" style={{width:'100%',height:600,border:0}} /></>}
  {build.status==='failed'&&<><p>{data?.resume.nextStage}</p><p>{data?.resume.notice}</p><button className="button workspace-button" type="button" disabled={!data||busy} onClick={()=>void resume()}>{busy?'Resuming…':'Resume saved build'}</button></>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
