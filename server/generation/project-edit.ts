import type {GeneratedFile,MasterSpecification} from '../domain.ts';
import {ApiError,digest,safePath} from '../lib.ts';
export type EditContext={paths:string[];snippets:Array<{path:string;content:string}>};
export type EditRequest={prompt:string;files:GeneratedFile[];context:EditContext};
export type EditPatch={status:'edited'|'needs_context';message:string;edits:Array<{path:string;before:string;after:string}>};
export const editSchema={type:'object',properties:{status:{type:'string',enum:['edited','needs_context']},message:{type:'string'},edits:{type:'array',items:{type:'object',properties:{path:{type:'string'},before:{type:'string'},after:{type:'string'}},required:['path','before','after'],additionalProperties:false}}},required:['status','message','edits'],additionalProperties:false};
const editable=(path:string)=>/^(frontend\/src\/[\w/.-]+\.(?:tsx?|jsx?|css)|frontend\/preview\.html|backend\/(?:app|tests)\/[\w/.-]+\.py|shared\/api-contract\.json|INTERACTIONS\.md)$/.test(path)&&!path.split('/').some(part=>part==='..'||part==='node_modules'||part.startsWith('.'));
export function editPrompt(spec:MasterSpecification,request:EditRequest):string{
 return ['Edit the existing customer application, not ForgeWeb. Implement the requested behavior; never substitute a restyled template. Preserve unrelated behavior, API boundaries, authentication and persistent data. Do not claim tests passed.',
 'Return exact string replacements in edits. For an existing file, before must match exactly once in its current source. Empty before is permitted ONLY to create a new source file. No file deletions, environment/credential files, database files or package/toolchain changes. Use only supplied source; if it is insufficient, return needs_context with an explanation and no edits. Return edited only for actual behavioral/source changes, never empty or no-op edits. Keep changes small and contract-matched across React and FastAPI. Update the self-contained preview when its UI changes.',
 JSON.stringify({product:spec.productName,request:request.prompt,requirements:spec.requirements.map(r=>({id:r.id,title:r.title})),apiRoutes:spec.architecture.backend.routes,files:request.files.map(f=>({path:f.path,digest:f.digest,characters:f.content.length})),source:request.context.snippets})].join('\n\n');
}
export function applyEditPatch(files:GeneratedFile[],raw:unknown,requirementIds:string[]):{files:GeneratedFile[];modifiedFiles:string[]}{
 if(!raw||typeof raw!=='object')throw new ApiError(422,'EDIT_INVALID_PATCH','The editor returned an invalid patch; no files changed.');
 const patch=raw as EditPatch;
 if(patch.status==='needs_context')throw new ApiError(422,'EDIT_NEEDS_CONTEXT',typeof patch.message==='string'?patch.message.slice(0,500):'More source context is required; no files changed.');
 if(patch.status!=='edited'||!Array.isArray(patch.edits)||patch.edits.length===0||patch.edits.length>12)throw new ApiError(422,'EDIT_INVALID_PATCH','The editor did not return a bounded, nonempty change.');
 const candidate=structuredClone(files),modified=new Set<string>();let bytes=0;
 for(const operation of patch.edits){
  if(!operation||typeof operation.path!=='string'||typeof operation.before!=='string'||typeof operation.after!=='string'||safePath(operation.path)!==operation.path||!editable(operation.path))throw new ApiError(422,'EDIT_INVALID_PATCH','The editor targeted an unsafe or unsupported file.');
  bytes+=Buffer.byteLength(operation.before)+Buffer.byteLength(operation.after);if(bytes>180000)throw new ApiError(422,'EDIT_INVALID_PATCH','The edit exceeds the supported patch size.');
  const file=candidate.find(f=>f.path===operation.path);
  if(file){if(!operation.before||operation.before===operation.after||file.content.split(operation.before).length!==2)throw new ApiError(422,'EDIT_STALE_PATCH','The replacement is ambiguous, stale or unchanged; no files changed.');file.content=file.content.replace(operation.before,()=>operation.after);if(!file.content.trim())throw new ApiError(422,'EDIT_INVALID_PATCH','Removing whole source files is not supported.');file.digest=digest(file.content);}
  else{if(operation.before||!operation.after.trim())throw new ApiError(422,'EDIT_INVALID_PATCH','New files must have empty before and nonempty source.');candidate.push({path:operation.path,content:operation.after,digest:digest(operation.after),requirementIds});}
  modified.add(operation.path);
 }
 if(modified.size>8)throw new ApiError(422,'EDIT_INVALID_PATCH','Edit at most eight files at once.');return {files:candidate,modifiedFiles:[...modified]};
}
