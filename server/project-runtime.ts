import {execFile} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,rm,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ApiError,digest,safePath,id} from './lib.ts';
import type {GeneratedFile,ValidationCheck} from './domain.ts';
import {sourceValidation,versionSourceHash} from './version-validation.ts';
import {backendVerification} from './generation/backend-verification.ts';
import {schemaWorkflowVerification} from './generation/schema-workflow-verification.ts';
import type {ProjectWorkspaceService} from './project-workspace.ts';

export type RuntimeStatus={status:'stopped'|'starting'|'running'|'failed';hasSession?:boolean;cleanupPending?:boolean;versionId?:string;validationStatus?:string;eligible?:boolean;url?:string;frontendHealthy:boolean;backendHealthy:boolean;message:string;databaseLocation?:string};
type Session={status:RuntimeStatus;resourcesPresent?:boolean;network:string;frontend:string;backend:string;proxy:string;volume:string;timer?:ReturnType<typeof setTimeout>};
const inspectDatabase=`import sqlite3,json,os,sys,re
p='/data/application.sqlite3'
if not os.path.exists(p): print(json.dumps({'collections':[],'rows':[],'total':0}));sys.exit(0)
db=sqlite3.connect('file:'+p+'?mode=ro',uri=True);db.execute('PRAGMA query_only=ON')
collection=sys.argv[1];offset=int(sys.argv[2])
tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 100") if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',r[0]) and not re.search(r'sqlite_|session|admin|credential|token|password|secret|config',r[0],re.I)]
if collection.startswith('table '):
 table=collection[6:]
 if table not in tables or table=='records': print(json.dumps({'collections':[],'rows':[],'total':0}));sys.exit(0)
 records=db.execute('SELECT * FROM "'+table+'" LIMIT 25 OFFSET ?',(offset,));names=[c[0] for c in records.description];data=[]
 for record in records:
  item=dict(zip(names,record))
  if 'payload' in item:
   raw=item['payload'];item=json.loads(raw) if isinstance(raw,str) and len(raw)<=8192 else {'notice':'Large record omitted from viewer'}
  data.append(item)
 result={'collections':[{'name':'table '+t,'count':db.execute('SELECT count(*) FROM "'+t+'"').fetchone()[0]} for t in tables if t!='records'],'rows':data,'total':db.execute('SELECT count(*) FROM "'+table+'"').fetchone()[0]}
 print(json.dumps(result));db.close();sys.exit(0)
if 'records' not in tables: print(json.dumps({'collections':[{'name':'table '+t,'count':db.execute('SELECT count(*) FROM "'+t+'"').fetchone()[0]} for t in tables],'rows':[],'total':0}));sys.exit(0)
collections=[{'name':r[0],'count':r[1]} for r in db.execute('SELECT collection,count(*) FROM records GROUP BY collection LIMIT 100')]
collections += [{'name':'table '+t,'count':db.execute('SELECT count(*) FROM "'+t+'"').fetchone()[0]} for t in tables if t!='records']
rows=[json.loads(r[0]) if len(r[0])<=8192 else {'notice':'Large record omitted from viewer'} for r in db.execute('SELECT payload FROM records WHERE collection=? ORDER BY rowid LIMIT 25 OFFSET ?',(collection,offset))]
total=db.execute('SELECT count(*) FROM records WHERE collection=?',(collection,)).fetchone()[0]
print(json.dumps({'collections':collections,'rows':rows,'total':total}));db.close()`;

export function redactStorage(value:unknown,depth=0):unknown{
  if(depth>6)return '[nested data]';
  if(typeof value==='string')return value.replace(/(?:gsk_|sk-or-v1-|AIza)[A-Za-z0-9_-]+/g,'[redacted]').replace(/((?:password|token|secret|api_key)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]').slice(0,2000);
  if(Array.isArray(value))return value.slice(0,25).map(item=>redactStorage(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,50).map(([key,item])=>[key,/password|secret|token|credential|authorization|cookie|api.?key/i.test(key)?'[redacted]':redactStorage(item,depth+1)]));
  return value;
}

// Only reviewed Docker commands run on the host. Generated code runs in containers.
export class ProjectRuntime {
  private sessions=new Map<string,Session>();
  private busy=new Set<string>();
  private prefix=`forgeweb-live-${randomUUID().slice(0,8)}`;
  private workspace:ProjectWorkspaceService;
  private dataDirectory:string;
  private environment:Record<string,string|undefined>;
  private partials=new Map<string,{hash:string;root:string}>();
  private partialBusy=new Set<string>();
  constructor(workspace:ProjectWorkspaceService,dataDirectory:string,environment:Record<string,string|undefined>=process.env){this.workspace=workspace;this.dataDirectory=dataDirectory;this.environment=environment;workspace.setCompiler?.(files=>this.compile(files));}
  private async docker(args:string[],timeout=30_000):Promise<string>{
    return new Promise((resolveResult,reject)=>execFile('docker',args,{windowsHide:true,timeout,maxBuffer:512*1024},(error,stdout,stderr)=>error?reject(new ApiError(503,'RUNTIME_DOCKER_FAILED',`Docker ${args[0]} failed or timed out. ${String(redactStorage(stderr+'\n'+stdout)).slice(0,1500)}`)):resolveResult((stdout+(args[0]==='logs'?stderr:'')).trim())));
  }
  private volume(projectId:string){return `forgeweb-app-${digest(projectId).slice(7,31)}-data`;}
  private async ownerEnvironment(projectId:string):Promise<string[]>{
    if(!/^[\w-]+$/.test(projectId))throw new ApiError(400,'PROJECT_ID_INVALID','Invalid project identifier.');
    const path=resolve(this.dataDirectory,'runtime-env',projectId+'.env');let content:string;
    try{content=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
    if(!/^BREW_ADMIN_PASSWORD=[A-Za-z0-9_-]{24,128}\r?\n?$/.test(content))throw new ApiError(422,'RUNTIME_ENV_INVALID','The project owner environment file must contain only a strong BREW_ADMIN_PASSWORD.');
    return ['--env-file',path];
  }
  private eligibility(projectId:string){const workspace=this.workspace.get(projectId);const version=workspace.currentVersion;return {versionId:version?.id,validationStatus:version?.validationStatus,eligible:Boolean(version&&version.validationStatus==='passed'&&(!version.validationSourceHash||version.validationSourceHash===versionSourceHash(workspace.files)))};}
  async validate(projectId:string,versionId:string){
    if(this.busy.has(projectId))throw new ApiError(409,'RUNTIME_BUSY','Runtime operation already in progress.');
    this.busy.add(projectId);try{return await this.workspace.validateVersion(projectId,versionId,files=>this.compile(files));}finally{this.busy.delete(projectId);}
  }
  async compilePartial(buildId:string,files:GeneratedFile[]){
    if(this.partialBusy.has(buildId))throw new ApiError(409,'PARTIAL_BUSY','Frontend compilation is already running.');
    this.partialBusy.add(buildId);
    let root:string|undefined;
    try{
      if(!files.some(file=>file.path==='frontend/src/main.tsx'))throw new ApiError(409,'FRONTEND_INCOMPLETE','The frontend entry point has not been generated yet.');
      const parent=resolve(this.dataDirectory,'partial-previews');await mkdir(parent,{recursive:true});root=await mkdtemp(join(parent,'compiled-'));
      const check=await this.compile(files,root);
      if(check.status!=='passed')throw new ApiError(422,'PARTIAL_COMPILE_FAILED',check.evidence);
      const old=this.partials.get(buildId);const hash=versionSourceHash(files);this.partials.set(buildId,{hash,root});root=undefined;
      if(old)await rm(old.root,{recursive:true,force:true}).catch(()=>{});
      return {url:`/api/builds/${encodeURIComponent(buildId)}/partial-preview/${encodeURIComponent(hash)}/index.html`,message:'Compiled frontend only. Backend connections are disabled; this is not a validated full-stack build.'};
    }finally{this.partialBusy.delete(buildId);if(root)await rm(root,{recursive:true,force:true}).catch(()=>{});}
  }
  async partialAsset(buildId:string,hash:string,path:string){
    const partial=this.partials.get(buildId);
    if(!partial||partial.hash!==hash)throw new ApiError(404,'PARTIAL_NOT_FOUND','Compile the saved frontend first.');
    if(path!=='index.html'&&!/^assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|png|jpe?g|webp|svg)$/.test(path))throw new ApiError(404,'ASSET_NOT_FOUND','Preview asset not found.');
    return readFile(join(partial.root,path));
  }
  private async compile(files:GeneratedFile[],output?:string):Promise<ValidationCheck>{
    const check:ValidationCheck={id:id('check'),name:'Isolated React typecheck and build',status:'failed',evidence:''};
    let root:string|undefined;const name=`forgeweb-validate-${randomUUID().slice(0,12)}`;
    try{
      await this.docker(['version','--format','{{.Server.Version}}']);
      const parent=resolve(this.dataDirectory,'validation');await mkdir(parent,{recursive:true});root=await mkdtemp(join(parent,'v-'));
      for(const file of files){if(!file.path.startsWith('frontend/')&&!((file.path.startsWith('backend/')||file.path==='shared/application-schema.json')&&!output)&&!['index.html','tsconfig.json'].includes(file.path))continue;const path=safePath(file.path),target=resolve(root,path);if(!target.startsWith(root+'/')&&!target.startsWith(root+'\\'))throw new Error('Invalid path');await mkdir(dirname(target),{recursive:true});await writeFile(target,file.content);}
      await mkdir(join(root,'node_modules'),{recursive:true});await writeFile(join(root,'validation.config.mjs'),`export default {root:'/app',base:'./',cacheDir:'/tmp/vite-cache',build:{outDir:'${output?'/preview-out':'/tmp/build'}'}};`);
      const volume=this.environment.FORGEWEB_RUNTIME_NODE_VOLUME??'forgeweb-runtime-node-deps-v1';
      // Inspect first: a missing prepared volume must not silently become an empty volume.
      await this.docker(['volume','inspect',volume,'--format','{{.Name}}']);
      await this.docker(['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','--mount',`type=bind,src=${root},dst=/app,readonly`,...(output?['--mount',`type=bind,src=${output},dst=/preview-out`]:[]),'--mount',`type=volume,src=${volume},dst=/app/node_modules,volume-subpath=node_modules,readonly`,'-w','/app','node:22-bookworm-slim','timeout','90','sh','-c','node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json && node node_modules/vite/bin/vite.js build --config /app/validation.config.mjs --configLoader native'],100_000);
      check.status='passed';check.evidence='TypeScript compiler and Vite build passed in a network-disabled container; generated package scripts were not executed.';
      if(!output){
        check.status='failed';check.name='Isolated frontend and backend verification';
        const pythonVolume=this.environment.FORGEWEB_RUNTIME_PYTHON_VOLUME??'forgeweb-runtime-python-deps-v1';
        await this.docker(['volume','inspect',pythonVolume,'--format','{{.Name}}']);
        const runBackend=(script:string,suffix:string)=>this.docker(['run','--rm','--name',name+suffix,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','--mount',`type=bind,src=${root},dst=/app,readonly`,'--mount',`type=volume,src=${pythonVolume},dst=/deps,readonly`,'-e','PYTHONPATH=/deps:/app/backend','-e','PYTHONDONTWRITEBYTECODE=1','-e','APP_DATABASE_PATH=/tmp/forgeweb-verification.sqlite3','-w','/app/backend','python:3.12-slim','timeout','60','python','-c',script],70000);
        const canonical=files.some(file=>file.path==='shared/application-schema.json');
        const independent=canonical?await runBackend(schemaWorkflowVerification,'-independent'):'';
        if(canonical){
          const line=independent.split('\n').findLast(value=>value.startsWith('FORGEWEB_SCHEMA_WORKFLOWS '));
          const evidence=line?JSON.parse(line.slice('FORGEWEB_SCHEMA_WORKFLOWS '.length)):undefined;
          const contract=JSON.parse(files.find(file=>file.path==='shared/application-schema.json')!.content);
          if(evidence?.status!=='passed'||evidence.routesCovered!==contract.routes.length||!(evidence.steps>0)||!(evidence.assertions>0))throw new Error('Independent workflows did not return complete passing execution evidence.');
        }
        const result=await runBackend(backendVerification,'-backend');
        if(!result.includes('FORGEWEB_BACKEND_EVIDENCE'))throw new Error('Backend verifier returned no execution evidence.');
        check.status='passed';check.evidence='React compiled. Backend tests executed against disposable SQLite, plus business GET readiness probes. '+result.slice(-1600)+(canonical?' Independent canonical workflow evidence: '+independent.slice(-1400):' Legacy application: schema-first workflow coverage is not established.');
      }
    }catch(error){check.evidence=String(redactStorage(error instanceof Error?error.message:'Isolated compilation failed')).slice(0,1500);}
    finally{await this.docker(['rm','-f',name]).catch(()=>{});if(!output){await this.docker(['rm','-f',name+'-backend']).catch(()=>{});await this.docker(['rm','-f',name+'-independent']).catch(()=>{});}if(root)await rm(root,{recursive:true,force:true}).catch(()=>{});}
    return check;
  }
  async status(projectId:string):Promise<RuntimeStatus>{
    const workspace=this.workspace.get(projectId);
    const session=this.sessions.get(projectId);
    if(!session)return {status:'stopped',...this.eligibility(projectId),frontendHealthy:false,backendHealthy:false,message:this.eligibility(projectId).eligible?'Static preview only. Start live preview to run React and FastAPI.':'This version needs validation before live preview can start.',databaseLocation:`Docker volume ${this.volume(projectId)} → /data/application.sqlite3`};
    if(session.status.status!=='running')return {...session.status,hasSession:session.resourcesPresent!==false};
    if(workspace.currentVersion?.id!==session.status.versionId)return {...session.status,status:'failed',hasSession:true,url:undefined,frontendHealthy:false,backendHealthy:false,message:'A different version is selected. Stop the old preview before restarting.'};
    try{
      const base=session.status.url!;
      const [frontend,backend]=await Promise.all([fetch(base,{signal:AbortSignal.timeout(3000)}),fetch(`${base}/health`,{signal:AbortSignal.timeout(3000)})]);
      const health=await backend.json() as {status?:string};
      if(this.sessions.get(projectId)!==session)return this.status(projectId);
      const healthy=frontend.ok&&backend.ok&&health.status==='ok';session.status={...session.status,hasSession:true,url:healthy?session.status.url:undefined,frontendHealthy:frontend.ok,backendHealthy:backend.ok&&health.status==='ok',status:healthy?'running':'failed',message:healthy?session.status.message:`Live health failed: frontend ${frontend.ok?'healthy':'unhealthy'}, backend ${backend.ok&&health.status==='ok'?'healthy':'unhealthy'}. Stop and restart; data is retained.`};return {...session.status};
    }catch{if(this.sessions.get(projectId)!==session)return this.status(projectId);session.status={...session.status,status:'failed',hasSession:true,url:undefined,frontendHealthy:false,backendHealthy:false,message:'Live server health check failed. Stop and restart; stored data is retained.'};return {...session.status};}
  }
  async start(projectId:string,expectedVersionId?:string):Promise<RuntimeStatus>{
    if(this.busy.has(projectId))throw new ApiError(409,'RUNTIME_BUSY','Runtime operation already in progress.');
    const otherProjects=new Set([...this.busy,...[...this.sessions].filter(([,session])=>session.resourcesPresent!==false).map(([id])=>id)]);otherProjects.delete(projectId);
    if(otherProjects.size>=2)throw new ApiError(409,'RUNTIME_LIMIT','Stop another preview before starting a third one.');
    this.busy.add(projectId);
    let attempted=false;
    try{
      const workspace=this.workspace.get(projectId);
      if(expectedVersionId&&workspace.currentVersion?.id!==expectedVersionId)throw new ApiError(409,'VERSION_CHANGED','The selected version changed. Refresh before starting.');
      if(!workspace.currentVersion||workspace.currentVersion.validationStatus!=='passed')throw new ApiError(409,'RUNTIME_VERSION_REQUIRED','Select a validated project version first.');
      if(!this.eligibility(projectId).eligible)throw new ApiError(409,'RUNTIME_VERSION_REQUIRED','Source changed after validation. Validate this version again.');
      const sourceHash=versionSourceHash(workspace.files);
      const checks=await sourceValidation(workspace.files);
      if(checks.some(check=>check.status!=='passed'))throw new ApiError(422,'RUNTIME_SOURCE_INVALID','Source checks failed. Validate this version to see the failures before starting the live runtime.');
      if(!workspace.currentVersion.validationChecks.some(check=>check.name==='Isolated frontend and backend verification'&&check.status==='passed')||workspace.currentVersion.validationSourceHash!==sourceHash){
        const validated=await this.workspace.validateVersion(projectId,workspace.currentVersion.id,files=>this.compile(files));
        if(validated.currentVersion?.validationStatus!=='passed')throw new ApiError(422,'RUNTIME_EXECUTION_FAILED','Isolated backend tests or readiness probes failed. Inspect version validation; live-ready status was not granted.');
      }
      await this.docker(['version','--format','{{.Server.Version}}']);
      const selected=this.workspace.get(projectId);if(selected.currentVersion?.id!==workspace.currentVersion.id||versionSourceHash(selected.files)!==sourceHash)throw new ApiError(409,'VERSION_CHANGED','Version changed during preflight. Refresh before starting.');
      await this.stopContainers(projectId);attempted=true;
      const suffix=digest(projectId+workspace.currentVersion.id).slice(7,23);
      const name=`${this.prefix}-${suffix}`;
      const session:Session={network:`${name}-net`,frontend:`${name}-web`,backend:`${name}-api`,proxy:`${name}-proxy`,volume:this.volume(projectId),status:{status:'starting',versionId:workspace.currentVersion.id,frontendHealthy:false,backendHealthy:false,message:'Compiling React and starting isolated FastAPI.',databaseLocation:`Docker volume ${this.volume(projectId)} → /data/application.sqlite3`}};
      this.sessions.set(projectId,session);
      const root=resolve(this.dataDirectory,'runtimes',suffix);
      await mkdir(root,{recursive:true});
      await mkdir(join(root,'node_modules'),{recursive:true});
      for(const file of workspace.files){
        const path=safePath(file.path);
        if(!path.startsWith('frontend/')&&!path.startsWith('backend/')&&!['index.html','tsconfig.json','package.json'].includes(path))continue;
        const target=resolve(root,path);
        if(!target.startsWith(root+'\\')&&!target.startsWith(root+'/'))throw new ApiError(422,'RUNTIME_PATH_INVALID','Generated path escapes the runtime.');
        await mkdir(dirname(target),{recursive:true});await writeFile(target,file.content,{mode:0o600});
      }
      const runner=join(root,'runner');await mkdir(runner,{recursive:true});
      await writeFile(join(runner,'vite.config.mjs'),`export default {root:'/app',cacheDir:'/tmp/vite-cache',server:{host:'0.0.0.0',port:5173,strictPort:true,allowedHosts:['127.0.0.1','localhost'],proxy:{'/api':'http://backend:8000','/health':'http://backend:8000'}},build:{outDir:'/tmp/frontend-build'}};`);
      await writeFile(join(runner,'nginx.conf'),`pid /tmp/nginx.pid; error_log /dev/stderr warn; events {} http { access_log off; map $http_upgrade $connection_upgrade { default upgrade; '' close; } proxy_temp_path /tmp/proxy; client_body_temp_path /tmp/body; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; server { listen 8080; location / { proxy_pass http://frontend:5173; proxy_http_version 1.1; proxy_set_header Host localhost; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; } } }`);
      await this.docker(['network','create','--internal',session.network]);
      const limits=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=128m'];
      const pythonVolume=this.environment.FORGEWEB_RUNTIME_PYTHON_VOLUME??'forgeweb-runtime-python-deps-v1';
      const nodeVolume=this.environment.FORGEWEB_RUNTIME_NODE_VOLUME??'forgeweb-runtime-node-deps-v1';
      await this.docker(['run','-d','--name',session.backend,'--network',session.network,'--network-alias','backend',...limits,...await this.ownerEnvironment(projectId),'--mount',`type=bind,src=${root},dst=/app,readonly`,'--mount',`type=volume,src=${pythonVolume},dst=/deps,readonly`,'--mount',`type=volume,src=${session.volume},dst=/data`,'-e','PYTHONPATH=/deps:/app/backend','-e','PYTHONDONTWRITEBYTECODE=1','-e','APP_DATABASE_PATH=/data/application.sqlite3','-w','/app/backend','python:3.12-slim','timeout','900','python','-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8000']);
      await this.docker(['run','-d','--name',session.frontend,'--network',session.network,'--network-alias','frontend',...limits,'--mount',`type=bind,src=${root},dst=/app,readonly`,'--mount',`type=volume,src=${nodeVolume},dst=/app/node_modules,volume-subpath=node_modules,readonly`,'-e','VITE_API_URL=','-w','/app','node:22-bookworm-slim','timeout','900','sh','-c','node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json && node node_modules/vite/bin/vite.js build --config /app/runner/vite.config.mjs --configLoader native && node node_modules/vite/bin/vite.js --config /app/runner/vite.config.mjs --configLoader native']);
      // Only this fixed reverse proxy has a published port; generated code stays internal.
      await this.docker(['create','--name',session.proxy,'--network','bridge',...limits,'--user','101:101','-p','127.0.0.1::8080','--mount',`type=bind,src=${runner},dst=/runner,readonly`,'--entrypoint','nginx','nginx:latest','-c','/runner/nginx.conf','-g','daemon off;']);
      await this.docker(['network','connect',session.network,session.proxy]);
      await this.docker(['start',session.proxy]);
      const port=await this.docker(['port',session.proxy,'8080/tcp']);
      if(!/^127\.0\.0\.1:\d+$/.test(port))throw new Error('Invalid preview port');
      session.status.url=`http://${port}`;
      for(let attempt=0;attempt<45;attempt++){
        try{const [response,frontend]=await Promise.all([fetch(`${session.status.url}/health`,{signal:AbortSignal.timeout(1500)}),fetch(session.status.url,{signal:AbortSignal.timeout(1500)})]);if(response.ok&&frontend.ok&&(await response.json() as {status?:string}).status==='ok'){const current=this.workspace.get(projectId);if(current.currentVersion?.id!==workspace.currentVersion.id||versionSourceHash(current.files)!==sourceHash)throw new ApiError(409,'VERSION_CHANGED','Version changed during startup.');session.status.status='running';session.status.message='React compiled; live Vite and FastAPI health checks passed. Application workflows still require testing.';session.status.frontendHealthy=true;session.status.backendHealthy=true;session.timer=setTimeout(()=>void this.stop(projectId).catch(()=>{}),15*60_000);session.timer.unref();return {...session.status};}}catch(error){if(error instanceof ApiError)throw error;}
        await new Promise(resolveWait=>setTimeout(resolveWait,500));
      }
      throw new ApiError(503,'RUNTIME_START_FAILED','React compilation or FastAPI startup did not pass within the startup deadline. No live-ready status was granted.');
    }catch(error){const session=attempted?this.sessions.get(projectId):undefined;let detail='';if(session){for(const name of [session.proxy,session.frontend,session.backend]){const log=await this.docker(['logs','--tail','8',name],5000).catch(()=>'');if(log)detail+=String(redactStorage(log)).slice(-500)+' ';}try{await this.stopContainers(projectId);}catch{throw new ApiError(503,'RUNTIME_CLEANUP_FAILED',`${error instanceof Error?error.message:'Runtime failed'} Cleanup also failed; containers may still be running. Retry Stop.`);}session.resourcesPresent=false;session.status={...session.status,status:'failed',hasSession:false,url:undefined,frontendHealthy:false,backendHealthy:false,message:error instanceof Error?error.message:'Runtime failed'};this.sessions.set(projectId,session);}if(detail)throw new ApiError(503,'RUNTIME_START_FAILED',`${error instanceof Error?error.message:'Startup failed'} ${detail}`);throw error;}
    finally{this.busy.delete(projectId);}
  }
  private async stopContainers(projectId:string){
    const session=this.sessions.get(projectId);if(!session)return;if(session.resourcesPresent===false){this.sessions.delete(projectId);return;}
    const failures:string[]=[];const remove=async(args:string[])=>{try{await this.docker(args,5000);}catch(error){if(!/No such (?:container|object|network)|network .+ not found/i.test(error instanceof Error?error.message:''))failures.push(args.at(-1)??'resource');}};
    await Promise.all([session.proxy,session.frontend,session.backend].map(name=>remove(['rm','-f',name])));await remove(['network','rm',session.network]);
    if(failures.length){session.status={...session.status,status:'failed',hasSession:true,cleanupPending:true,url:undefined,frontendHealthy:false,backendHealthy:false,message:'Docker cleanup failed; containers may still be running. Retry Stop. SQLite data is retained.'};throw new ApiError(503,'RUNTIME_CLEANUP_FAILED',session.status.message);}
    if(session.timer)clearTimeout(session.timer);this.sessions.delete(projectId);
  }
  async stop(projectId:string){this.workspace.get(projectId);if(this.busy.has(projectId))throw new ApiError(409,'RUNTIME_BUSY','Runtime operation in progress.');this.busy.add(projectId);try{await this.stopContainers(projectId);return this.status(projectId);}finally{this.busy.delete(projectId);}}
  async shutdown(){const results=await Promise.allSettled([...this.sessions.keys()].map(id=>this.stopContainers(id)));await Promise.all([...this.partials.values()].map(value=>rm(value.root,{recursive:true,force:true}).catch(()=>{})));this.partials.clear();if(results.some(result=>result.status==='rejected'))throw new Error('Some runtime containers could not be removed; inspect Docker and retry cleanup.');}
  async storage(projectId:string,collection='',offset=0){
    this.workspace.get(projectId);
    if(!/^[\w -]{0,80}$/.test(collection)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ApiError(400,'STORAGE_QUERY_INVALID','Invalid collection or page offset.');
    const volume=this.volume(projectId);
    await this.docker(['version','--format','{{.Server.Version}}']);
    try{await this.docker(['volume','inspect',volume,'--format','{{.Name}}']);}catch{return {engine:'SQLite',location:`Docker volume ${volume} → /data/application.sqlite3`,collections:[],rows:[],total:0,message:'No runtime database exists yet. Start a live preview and save a record.'};}
    const result=await this.docker(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--pids-limit','32','--mount',`type=volume,src=${volume},dst=/data,readonly`,'python:3.12-slim','python','-I','-S','-c',inspectDatabase,collection,String(offset)]);
    return {engine:'SQLite',location:`Docker volume ${volume} → /data/application.sqlite3`,...redactStorage(JSON.parse(result)) as object,offset,limit:25};
  }
}
