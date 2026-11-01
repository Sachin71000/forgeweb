import {digest,ApiError} from '../lib.ts';
import type {MasterSpecification} from '../domain.ts';
import {GenerationEvidence} from '../providers/generation-evidence.ts';
import {validateApplicationSchema,generateSchemaBindings} from './application-schema.ts';
type File={path:string;content:string;requirementIds:string[]};
export async function generateSchemaStage(spec:MasterSpecification,request:(prompt:string,path:string,budget:number)=>Promise<{files:File[]}>,evidence:GenerationEvidence):Promise<File[]>{
 const path='shared/application-schema.json',requirements=spec.requirements.map(value=>value.id);
 const approvedRoutes=spec.architecture.backend.routes?.filter(route=>!/^GET\s+\/health\s*$/i.test(route));
 const input={projectId:spec.projectId,product:spec.productName,prompt:spec.prompt,requirements:spec.requirements,routes:approvedRoutes??[]};
 const key='application-schema-v1:'+digest(JSON.stringify(input));let file=await evidence.cachedFile(key);
 if(!file){
  const response=await request([
   'Before generating source, define the SINGLE authoritative application schema and independent executable API workflows. Return exactly one files entry at shared/application-schema.json whose content is JSON, not code. Use only the supported schema below; never invent additional keys. Preserve approved routes, fields, units and requirements. No login/external integrations unless approved. Every mutation needs a successful test step, and workflows must assert returned/persisted values, not just status. Include invalid-input rejection cases and cleanup steps. ID path templates in routes use {id}; workflow captures use {{variable}}. Keep the schema concise.',
   `Shape: {version:"1",models:{ModelName:{fields:{field:{type:"string"|"integer"|"number"|"boolean"|"model"|"array",model?:"Name",items?:{type:"string"|"integer"|"number"|"boolean"|"model",model?:"Name"},required?:boolean,nullable?:boolean,enum?:[primitive],minimum?:number,maximum?:number,minLength?:number,maxLength?:number,format?:"date"|"date-time"|"email"}}}},routes:[{method:"GET"|"POST"|"PUT"|"PATCH"|"DELETE",path:"/api/items/{id}",requestModel?:"Name",responseModel?:"Name",responseArray?:boolean,successStatus:200}],workflows:[{name:"CRUD",steps:[{method:"POST",path:"/api/items",body:{name:"QA"},expectedStatus:201,assertions:[{pointer:"/name",equals:"QA"},{pointer:"/id",exists:true}],capture:{id:"/id"}},{method:"GET",path:"/api/items/{{id}}",expectedStatus:200,assertions:[{pointer:"/name",equals:"QA"}]}]}]}. required defaults true. Use distinct write/read models. Each route must be covered, each mutation by a success step; captured variables must exist before use. Request models contain only fields the UI submits; persisted IDs/timestamps belong in response models. All assertions use RFC6901 JSON pointers. Only standard JSON primitive literal values. Avoid arbitrary unions/generics/inheritance: this supported contract subset must describe the whole requested application or stop explicitly.`,
   JSON.stringify(input),`Attach these requirement IDs: ${JSON.stringify(requirements)}`
  ].join('\n\n'),path,6000);
  if(response.files?.length!==1||response.files[0]?.path!==path)throw new ApiError(422,'APPLICATION_SCHEMA_INVALID','The schema stage must return one canonical schema file.');file=response.files[0];
  if(!file.requirementIds?.length||!file.requirementIds.every(id=>requirements.includes(id)))throw new ApiError(422,'APPLICATION_SCHEMA_INVALID','Schema requirement mapping is invalid.');
  try{validateApplicationSchema(JSON.parse(file.content),approvedRoutes);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(422,'APPLICATION_SCHEMA_INVALID','Schema content is not valid JSON. No implementation was requested.');}
  await evidence.cacheFile(key,file);if(!await evidence.cachedFile(key))throw new ApiError(503,'FRONTEND_CHECKPOINT_FAILED','The canonical schema could not be safely saved. No code generation was started.');
 }
 const schema=validateApplicationSchema(JSON.parse(file.content),approvedRoutes);
 return [file,...generateSchemaBindings(schema).map(binding=>({...binding,requirementIds:requirements}))];
}
