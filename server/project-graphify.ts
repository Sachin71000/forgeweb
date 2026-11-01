import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { digest, safePath } from './lib.ts';
import type { GeneratedFile } from './domain.ts';

export type GraphifyStatus = { status: 'ready'|'warning'; message: string; nodes?: number; edges?: number; sourceHash: string };
type Node = { id:string; label?:string; source_file?:string };
type Link = {source:string;target:string};
type Snapshot = GraphifyStatus & { nodesData:Node[]; linksData:Link[] };
const execute=promisify(execFile);
const allowed=(path:string)=>/^(frontend|backend|shared)\//.test(path)&&/\.(tsx?|jsx?|py|css|html|json)$/.test(path)&&!/(^|\/)(node_modules|dist|\.git|data|__pycache__)(\/|$)/.test(path)&&!/(secret|credential|\.env)/i.test(path);
export function graphifySources(files:GeneratedFile[]):GeneratedFile[]{
  return files.filter(file=>{try{return safePath(file.path)===file.path&&allowed(file.path);}catch{return false;}});
}
export function graphifyHash(files:GeneratedFile[]):string{return digest(JSON.stringify(graphifySources(files).map(f=>[f.path,digest(f.content)]).sort((a,b)=>a[0].localeCompare(b[0]))));}

/** Code-only local extraction: generated source is data, never executable input. */
export class ProjectGraphify {
  private jobs=new Map<string,Promise<Snapshot>>();
  private failures=new Map<string,{at:number;snapshot:Snapshot}>();
  private root:string;
  private run:typeof execute;
  constructor(root:string,run=execute){this.root=root;this.run=run;}
  private location(projectId:string,versionId:string){return join(this.root,digest(projectId).slice(7,31),digest(versionId).slice(7,31));}
  async ensure(projectId:string,versionId:string,files:GeneratedFile[]):Promise<Snapshot>{
    const sourceHash=graphifyHash(files),key=this.location(projectId,versionId);
    const failure=this.failures.get(key);if(failure&&failure.snapshot.sourceHash===sourceHash&&Date.now()-failure.at<60_000)return failure.snapshot;
    const pending=this.jobs.get(key);if(pending){await pending;return this.ensure(projectId,versionId,files);}
    const job=this.build(key,sourceHash,files).then(snapshot=>{if(snapshot.status==='warning')this.failures.set(key,{at:Date.now(),snapshot});else this.failures.delete(key);return snapshot;}).finally(()=>this.jobs.delete(key));this.jobs.set(key,job);return job;
  }
  private async build(location:string,sourceHash:string,files:GeneratedFile[]):Promise<Snapshot>{
    const fallback:Snapshot={status:'warning',message:'Local graph unavailable; edits use bounded source inspection.',sourceHash,nodesData:[],linksData:[]};
    if(process.env.FORGEWEB_GRAPHIFY_ENABLED==='false')return {...fallback,message:'Local graph indexing is disabled.'};
    let temporary:string|undefined;
    try{
      await mkdir(location,{recursive:true});
      try{const cached=JSON.parse(await readFile(join(location,'snapshot.json'),'utf8')) as Snapshot;
        if(cached.status==='ready'&&cached.sourceHash===sourceHash&&Array.isArray(cached.nodesData)&&Array.isArray(cached.linksData))return cached;
      }catch{/* missing or corrupt cache is rebuilt */}
      temporary=await mkdtemp(join(location,'extract-'));const input=join(temporary,'source'),output=join(temporary,'output');
      await mkdir(input,{recursive:true});const sources=graphifySources(files);
      if(sources.length>500||sources.reduce((sum,f)=>sum+Buffer.byteLength(f.content),0)>8_000_000)throw new Error('Source limit');
      for(const file of sources){const target=join(input,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.content,{flag:'wx'});}
      const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|HOME|UV_TOOL_DIR|UV_TOOL_BIN_DIR)$/i.test(key)));
      await this.run('graphify',['extract',input,'--code-only','--max-workers','2','--out',output],{timeout:45_000,maxBuffer:128_000,windowsHide:true,env});
      const path=join(output,'graphify-out','graph.json');if((await stat(path)).size>16_000_000)throw new Error('Graph limit');
      const graph=JSON.parse(await readFile(path,'utf8')) as {nodes:Node[];links:Link[]};
      if(!Array.isArray(graph.nodes)||!Array.isArray(graph.links)||graph.nodes.length>50_000||graph.links.length>100_000)throw new Error('Graph shape');
      const paths=new Set(sources.map(f=>f.path));
      const nodesData=graph.nodes.filter(n=>typeof n.id==='string'&&typeof n.source_file==='string'&&paths.has(n.source_file.replaceAll('\\','/'))).map(n=>({id:n.id,label:String(n.label??'').slice(0,160),source_file:n.source_file!.replaceAll('\\','/')}));
      const ids=new Set(nodesData.map(n=>n.id));const linksData=graph.links.filter(l=>ids.has(l.source)&&ids.has(l.target)).map(l=>({source:l.source,target:l.target}));
      const result:Snapshot={status:'ready',message:'Local code graph ready. Styles are inspected directly for visual edits.',sourceHash,nodes:nodesData.length,edges:linksData.length,nodesData,linksData};
      await writeFile(join(temporary,'snapshot.json'),JSON.stringify(result));await rename(join(temporary,'snapshot.json'),join(location,'snapshot.json'));return result;
    }catch{return fallback;}finally{if(temporary)await rm(temporary,{recursive:true,force:true}).catch(()=>{});}
  }
  async context(projectId:string,versionId:string,files:GeneratedFile[],prompt:string){
    const graph=await this.ensure(projectId,versionId,files);const words=prompt.toLowerCase().match(/[a-z]{3,}/g)??[];
    const seeds=graph.nodesData.filter(n=>words.some(word=>`${n.label} ${n.source_file}`.toLowerCase().includes(word)));
    const ids=new Set(seeds.map(n=>n.id));for(const link of graph.linksData)if(ids.has(link.source)||ids.has(link.target)){ids.add(link.source);ids.add(link.target);if(ids.size>100)break;}
    const paths=new Set(graph.nodesData.filter(n=>ids.has(n.id)).map(n=>n.source_file!));
    if(/color|style|design|layout|font|background|responsive|mobile/i.test(prompt))for(const f of graphifySources(files))if(/\.(css|tsx|html)$/.test(f.path))paths.add(f.path);
    const selected=graphifySources(files).filter(f=>paths.has(f.path));
    const explicit=[...new Set(prompt.match(/(?:frontend|backend|shared)\/[\w/.-]+\.(?:tsx?|jsx?|py|css|html|json)/g)??[])];
    const targets=explicit.map(path=>graphifySources(files).find(file=>file.path===path)).filter((file):file is GeneratedFile=>Boolean(file));
    const candidates=targets.length?targets:selected.length?selected:graphifySources(files);
    let remaining=12_000;const snippets=[];for(const file of candidates.slice(0,12)){if(remaining<=0)break;const content=file.content.slice(0,Math.min(remaining,targets.length?12000:3000));remaining-=content.length;snippets.push({path:file.path,content});}
    return {status:graph.status,paths:candidates.slice(0,12).map(f=>f.path),snippets,characters:12_000-remaining};
  }
}
