import {parse} from '@babel/parser';
import {ApiError,digest} from '../lib.ts';
import type {MasterSpecification} from '../domain.ts';
import {GenerationEvidence} from '../providers/generation-evidence.ts';
import {frontendImplementationPrompt,FORGEWEB_MASTER_GENERATION_PROMPT} from './master-prompt.ts';
import {fileDependencyContext} from './file-context.ts';
import {generateSchemaStage} from './schema-stage.ts';
type File={path:string;content:string;requirementIds:string[]};
type Request=(prompt:string,path:string,budget:number)=>Promise<{files:File[]}>;
export function frontendPagePaths(spec:MasterSpecification):string[]{
 const pages=spec.architecture.frontend.pages;
 if(!pages.length||pages.length>12)throw new ApiError(422,'FRONTEND_PAGE_LIMIT','Approve between one and twelve frontend pages before generation.');
 return pages.map((name,index)=>`frontend/src/pages/Page${index+1}_${name.replace(/[^a-z0-9]/gi,'').slice(0,40)||'View'}.tsx`);
}
function valid(file:File,path:string,requirements:Set<string>):boolean{
 if(!file||file.path!==path||typeof file.content!=='string'||!file.content.trim()||file.content.length>180000||!Array.isArray(file.requirementIds)||!file.requirementIds.length||!file.requirementIds.every(id=>requirements.has(id)))return false;
 try{if(/\.tsx?$/.test(path))parse(file.content,{sourceType:'module',plugins:['typescript','jsx']});if(path==='package.json')JSON.parse(file.content);}catch{return false;}return true;
}
export async function generateFrontendPages(spec:MasterSpecification,request:Request,evidence:GenerationEvidence,progress?:(text:string)=>Promise<void>,checkpoint?:(files:File[])=>Promise<void>):Promise<{files:File[]}>{
 const pages=frontendPagePaths(spec),paths=['package.json','frontend/src/lib/api.ts','frontend/src/styles.css','frontend/src/components/Shell.tsx',...pages,'frontend/src/App.tsx','frontend/src/main.tsx','INTERACTIONS.md','frontend/preview.html'];
 const files:File[]=await generateSchemaStage(spec,request,evidence),requirements=new Set(spec.requirements.map(r=>r.id)),brief=frontendImplementationPrompt(spec);
 await checkpoint?.([...files]);
 for(const path of paths){
  const dependencies=fileDependencyContext(files,path.endsWith('preview.html')?'frontend/src/App.tsx':path);
  // Cache identity includes the approved brief, exact dependency bodies, and plan.
  // Requests contain signatures only; metadata bookkeeping never invalidates it.
  const key='frontend-pages-v1:'+digest(JSON.stringify({project:spec.projectId,policy:FORGEWEB_MASTER_GENERATION_PROMPT,brief,paths,path,dependencies:files.map(f=>[f.path,digest(f.content)])}));
  const cached=await evidence.cachedFile(key);
  if(cached&&valid(cached,path,requirements)){files.push(cached);await checkpoint?.([...files]);await progress?.(`Reusing checked frontend ${files.length}/${paths.length}: ${path}.`);continue;}
  const index=pages.indexOf(path),budget=path.endsWith('preview.html')?8000:6000;
  await evidence.record({event:'frontend_context_size',path,sourceCharacters:files.reduce((sum,file)=>sum+file.content.length,0),sentDependencyCharacters:dependencies.reduce((sum,file)=>sum+file.content.length,0)});
  const requestBrief=path.endsWith('styles.css')?[
   'Generate exactly one complete plain CSS stylesheet, not React, HTML, JavaScript, Tailwind output or a whole application. Return JSON containing only the requested file. Use a compact shared design system with variables, responsive sidebar/navigation, forms, tables/cards, buttons, validation/empty states, visible keyboard focus, and reduced-motion support. Aim for 6000-10000 characters of CSS; do not reproduce an entire design export or add redundant variants. Close every rule. Pages and behavior are generated separately.',
   JSON.stringify({productName:spec.productName,customerPrompt:spec.prompt,visualDirection:spec.architecture.frontend.visualDirection,pages:spec.architecture.frontend.pages,requirementIds:[...requirements]})
  ].join('\n\n'):frontendImplementationPrompt(spec,true,true);
  const prompt=[requestBrief,`STAGED OVERRIDE: Return ONLY ${path}; all other files are generated separately. Approved paths: ${JSON.stringify(paths)}. Shared state, cart and navigation belong to App/Shell; pages use explicit props and the shared API module. Do not inline other pages. ${index>=0?'Implement only approved page '+JSON.stringify(spec.architecture.frontend.pages[index])+'.':''}`,
   'The canonical schema and deterministic frontend/src/lib/contracts.ts below are frozen. Import their types/constants into api.ts and pages; never regenerate duplicate DTOs or independent enum values. All API requests MUST call generated contractRouteN helpers (index N matches CONTRACT_ROUTES), with params object, typed body or undefined, optional query object, optional AbortSignal. No fetch/XMLHttpRequest/axios/WebSocket outside contracts.ts. api.ts may wrap helpers for domain naming, errors and formatting and re-export imported types. Do not edit generated contracts. Independent workflows will execute after generation.',
   path.endsWith('/lib/api.ts')?'Freeze categorical choices in this shared API module as explicit literal unions/enums and exported constants when the UI restricts choices. Do not use an unconstrained string alias for a restricted enum. Request/response fields, units and error shapes are the immutable handoff to Python.':'UI categorical choices must come from the shared API module or real server metadata; never invent a different local enum. Preserve existing dependency exports and types.',
   'Use public stable images, never credential-bearing or signed URLs. Preserve the exact dependency exports below. Omitted function bodies already exist; do not recreate them. Preview is a separate concise self-contained HTML document with real scripted navigation and interactions; actual full-stack behavior is provided by React and FastAPI.',JSON.stringify(dependencies)].join('\n\n');
  await progress?.(`Generating frontend ${files.length+1}/${paths.length}: ${path}.`);
  const response=await request(prompt,path,budget);
  if(!Array.isArray(response.files)||response.files.length!==1||!valid(response.files[0],path,requirements))throw new ApiError(422,'MODEL_FRONTEND_FILE_INVALID',`${path} was rejected. Earlier checkpoints are retained; retry resumes here.`);
  const file=response.files[0];await evidence.cacheFile(key,file);
  const saved=await evidence.cachedFile(key);
  if(!saved||digest(saved.content)!==digest(file.content))throw new ApiError(503,'FRONTEND_CHECKPOINT_FAILED',`${path} could not be safely checkpointed. Generation stopped to prevent paying for later files without recovery.`);
  files.push(file);
  await checkpoint?.([...files]);
 }
 return {files};
}
