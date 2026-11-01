import {ApiError} from '../lib.ts';

export type SchemaValue = null | boolean | number | string | SchemaValue[] | {[key:string]:SchemaValue};
export type SchemaItem = {type:'string'|'integer'|'number'|'boolean'|'model';model?:string};
export type SchemaField = {type:SchemaItem['type']|'array';model?:string;items?:SchemaItem;required?:boolean;nullable?:boolean;enum?:Array<string|number|boolean>;minimum?:number;maximum?:number;minLength?:number;maxLength?:number;format?:'date'|'date-time'|'email'};
export type SchemaRoute = {method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE';path:string;requestModel?:string;responseModel?:string;responseArray?:boolean;successStatus:number};
export type SchemaAssertion = {pointer:string;equals?:SchemaValue;exists?:boolean};
export type SchemaStep = {method:SchemaRoute['method'];path:string;body?:SchemaValue;expectedStatus:number;assertions:SchemaAssertion[];capture?:Record<string,string>};
export type ApplicationSchema = {version:'1';models:Record<string,{fields:Record<string,SchemaField>}>;routes:SchemaRoute[];workflows:Array<{name:string;steps:SchemaStep[]}>};
const invalid=(message:string):never=>{throw new ApiError(422,'APPLICATION_SCHEMA_INVALID',message);};
const reserved=new Set('class def import from None True False return pass raise if else elif try except finally for while with as assert lambda yield await async del global nonlocal and or not in is break continue match case type interface enum extends implements export default function const let var new null true false number string boolean any unknown never object model_config model_fields model_dump model_validate ContractModel BaseModel ConfigDict Field Literal field_validator model_serializer'.split(' '));
const identifier=(value:string)=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)&&!reserved.has(value);
function object(value:unknown,label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid(`${label} must be an object.`);return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,allowed:string[],label:string){if(Object.keys(value).some(key=>!allowed.includes(key)))invalid(`${label} contains unsupported keys.`);}
function pointer(value:unknown):value is string{return typeof value==='string'&&value.length<=500&&(value===''||/^\/(?:[^~]|~[01])*$/.test(value));}
function primitive(type:string,value:unknown){return type==='integer'?Number.isSafeInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type;}
const methods=['GET','POST','PUT','PATCH','DELETE'];
function normalizedPath(path:string){return path.replace(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}|\{[A-Za-z][A-Za-z0-9_]*\}|:[A-Za-z][A-Za-z0-9_]*/g,'{}').split('?')[0];}
function validPath(path:unknown,template=false):path is string{return typeof path==='string'&&path.length<=300&&/^\/api\/[A-Za-z0-9_/.-]+(?:\?[^#\s]*)?$/.test(path.replace(template?/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g:/\{[A-Za-z][A-Za-z0-9_]*\}/g,'id'))&&!path.includes('..')&&!path.includes('//')&&(template||!path.includes('?'));}
function jsonValue(value:unknown,depth=0):boolean {if(depth>8)return false;if(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=4000||typeof value==='number'&&Number.isFinite(value))return true;if(Array.isArray(value))return value.length<=100&&value.every(item=>jsonValue(item,depth+1));if(value&&typeof value==='object')return Object.keys(value).length<=100&&Object.entries(value).every(([key,item])=>key!=='__proto__'&&key!=='constructor'&&jsonValue(item,depth+1));return false;}
function validateExample(models:ApplicationSchema['models'],modelName:string,value:unknown,depth=0):void{
 if(depth>8)invalid('Workflow example nesting exceeds the supported limit.');
 const record=object(value,'Successful request example');const fields=models[modelName].fields;
 if(Object.keys(record).some(key=>!Object.hasOwn(fields,key)))invalid('Successful request example contains an undeclared field.');
 for(const [name,field] of Object.entries(fields)){
  if(!Object.hasOwn(record,name)){if(field.required!==false)invalid(`Successful request example omits ${modelName}.${name}.`);continue;}
  const item=record[name];if(typeof item==='string'&&/^\{\{[A-Za-z][A-Za-z0-9_]*\}\}$/.test(item))continue;
  if(item===null){if(!field.nullable)invalid(`Successful request example sends null for ${name}.`);continue;}
  if(field.type==='model'){validateExample(models,field.model!,item,depth+1);continue;}
  if(field.type==='array'){if(!Array.isArray(item))invalid(`Successful request example has wrong array type for ${name}.`);for(const element of item as unknown[]){if(field.items!.type==='model')validateExample(models,field.items!.model!,element,depth+1);else if(!primitive(field.items!.type,element))invalid(`Successful request example has wrong array member type for ${name}.`);}continue;}
  if(!primitive(field.type,item))invalid(`Successful request example has wrong type for ${name}.`);
  if(field.enum&&!field.enum.includes(item as never))invalid(`Successful request example has an invalid enum for ${name}.`);
  if(typeof item==='number'&&(field.minimum!==undefined&&item<field.minimum||field.maximum!==undefined&&item>field.maximum))invalid(`Successful request example violates bounds for ${name}.`);
  if(typeof item==='string'&&(field.minLength!==undefined&&[...item].length<field.minLength||field.maxLength!==undefined&&[...item].length>field.maxLength))invalid(`Successful request example violates length bounds for ${name}.`);
 }
}

/** Strict bounded subset: unsupported features fail before bindings or paid implementation. */
export function validateApplicationSchema(raw:unknown,approvedRoutes?:string[]):ApplicationSchema {
 const root=object(raw,'Schema');keys(root,['version','models','routes','workflows'],'Schema');if(root.version!=='1')invalid('Schema version must be 1.');
 const models=object(root.models,'models');const names=Object.keys(models);if(!names.length||names.length>30||names.some(name=>!identifier(name)||['date','datetime'].includes(name)))invalid('Provide 1–30 safe model names.');
 for(const [name,rawModel] of Object.entries(models)){
  const model=object(rawModel,name);keys(model,['fields'],name);const fields=object(model.fields,`${name}.fields`);if(!Object.keys(fields).length||Object.keys(fields).length>50)invalid('Each model needs 1–50 fields.');
  for(const [fieldName,rawField] of Object.entries(fields)){
   if(!identifier(fieldName))invalid(`Unsafe field name ${fieldName}.`);const field=object(rawField,fieldName);keys(field,['type','model','items','required','nullable','enum','minimum','maximum','minLength','maxLength','format'],fieldName);
   if(!['string','integer','number','boolean','model','array'].includes(String(field.type)))invalid(`Unsupported type for ${fieldName}.`);
   for(const flag of ['required','nullable'])if(field[flag]!==undefined&&typeof field[flag]!=='boolean')invalid(`${flag} must be boolean.`);
   if(field.type==='model'){if(typeof field.model!=='string'||!names.includes(field.model))invalid(`Unknown model reference in ${fieldName}.`);}else if(field.model!==undefined)invalid('model is only allowed for a model field.');
   if(field.type==='array'){const item=object(field.items,`${fieldName}.items`);keys(item,['type','model'],'items');if(!['string','integer','number','boolean','model'].includes(String(item.type)))invalid('Unsupported array item type.');if(item.type==='model'){if(typeof item.model!=='string'||!names.includes(item.model))invalid('Unknown array model reference.');}else if(item.model!==undefined)invalid('Unexpected item model reference.');}else if(field.items!==undefined)invalid('items requires array type.');
   if(field.enum!==undefined){if(!Array.isArray(field.enum)||!field.enum.length||field.enum.length>100||!field.enum.every(value=>primitive(String(field.type),value))||new Set(field.enum.map(value=>JSON.stringify(value))).size!==field.enum.length)invalid(`Invalid enum for ${fieldName}.`);}
   for(const bound of ['minimum','maximum'])if(field[bound]!==undefined&&(!['integer','number'].includes(String(field.type))||typeof field[bound]!=='number'||!Number.isFinite(field[bound])||field.type==='integer'&&!Number.isSafeInteger(field[bound])))invalid(`Invalid numeric constraint ${bound}.`);
   for(const bound of ['minLength','maxLength'])if(field[bound]!==undefined&&(field.type!=='string'||!Number.isSafeInteger(field[bound])||Number(field[bound])<0||Number(field[bound])>100000))invalid(`Invalid string constraint ${bound}.`);
   if(field.minimum!==undefined&&field.maximum!==undefined&&Number(field.minimum)>Number(field.maximum)||field.minLength!==undefined&&field.maxLength!==undefined&&Number(field.minLength)>Number(field.maxLength))invalid('Constraint bounds are reversed.');
   if(Array.isArray(field.enum))for(const value of field.enum){if(typeof value==='number'&&(field.minimum!==undefined&&value<Number(field.minimum)||field.maximum!==undefined&&value>Number(field.maximum))||typeof value==='string'&&(field.minLength!==undefined&&[...value].length<Number(field.minLength)||field.maxLength!==undefined&&[...value].length>Number(field.maxLength)))invalid('Enum values contradict their validation constraints.');}
   if(field.format!==undefined&&(field.type!=='string'||!['date','date-time','email'].includes(String(field.format))))invalid('Unsupported format.');
  }
 }
 if(!Array.isArray(root.routes)||!root.routes.length||root.routes.length>60)invalid('Provide 1–60 routes.');
 const routes=root.routes as unknown[];const routeKeys=new Set<string>();
 for(const rawRoute of routes){const route=object(rawRoute,'route');keys(route,['method','path','requestModel','responseModel','responseArray','successStatus'],'route');if(!methods.includes(String(route.method))||!validPath(route.path))invalid('Invalid route.');const key=String(route.method)+' '+normalizedPath(String(route.path));if(routeKeys.has(key))invalid('Duplicate route.');routeKeys.add(key);for(const reference of ['requestModel','responseModel'])if(route[reference]!==undefined&&!names.includes(String(route[reference])))invalid('Unknown route model.');if(route.responseArray!==undefined&&typeof route.responseArray!=='boolean'||route.responseArray&&!route.responseModel)invalid('responseArray needs a response model.');if(!Number.isInteger(route.successStatus)||Number(route.successStatus)<200||Number(route.successStatus)>299)invalid('Invalid successful route status.');if(route.successStatus===204&&route.responseModel)invalid('204 must not declare a response body.');}
 if(approvedRoutes){const approved=new Set(approvedRoutes.map(value=>{const match=value.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);if(!match)invalid('Approved route is not a method/path contract.');return match![1].toUpperCase()+' '+normalizedPath(match![2]);}));if(approved.size!==routeKeys.size||[...approved].some(key=>!routeKeys.has(key)))invalid('Schema routes differ from approved architecture.');}
 if(!Array.isArray(root.workflows)||!root.workflows.length||root.workflows.length>20)invalid('Provide 1–20 independent workflows.');
 const covered=new Set<string>();
 for(const rawWorkflow of root.workflows as unknown[]){const workflow=object(rawWorkflow,'workflow');keys(workflow,['name','steps'],'workflow');if(typeof workflow.name!=='string'||!workflow.name.trim()||workflow.name.length>100||!Array.isArray(workflow.steps)||!workflow.steps.length||workflow.steps.length>40)invalid('Invalid workflow.');const captured=new Set<string>();let assertions=0;
  for(const rawStep of workflow.steps as unknown[]){const step=object(rawStep,'step');keys(step,['method','path','body','expectedStatus','assertions','capture'],'step');if(!methods.includes(String(step.method))||!validPath(step.path,true)||!Number.isInteger(step.expectedStatus)||Number(step.expectedStatus)<200||Number(step.expectedStatus)>599)invalid('Invalid workflow step.');const key=String(step.method)+' '+normalizedPath(String(step.path));if(!routeKeys.has(key))invalid('Workflow targets an undeclared route.');if(step.body!==undefined&&!jsonValue(step.body))invalid('Workflow body is not bounded JSON.');for(const variable of JSON.stringify([step.path,step.body,step.assertions]).matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g))if(!captured.has(variable[1]))invalid(`Variable ${variable[1]} used before capture.`);
   if(!Array.isArray(step.assertions)||step.assertions.length>30)invalid('Step assertions must be an array.');for(const rawAssertion of step.assertions as unknown[]){const assertion=object(rawAssertion,'assertion');keys(assertion,['pointer','equals','exists'],'assertion');if(!pointer(assertion.pointer)||Object.hasOwn(assertion,'equals')===Object.hasOwn(assertion,'exists')||assertion.exists!==undefined&&typeof assertion.exists!=='boolean'||Object.hasOwn(assertion,'equals')&&!jsonValue(assertion.equals))invalid('Use a JSON pointer and exactly one equals/exists assertion.');assertions++;}
   if(step.capture!==undefined){const capture=object(step.capture,'capture');if(Object.keys(capture).length>20)invalid('Too many captures.');for(const [name,path] of Object.entries(capture)){if(!identifier(name)||!pointer(path)||captured.has(name))invalid('Invalid or duplicate capture.');captured.add(name);}}
   if(Number(step.expectedStatus)>=200&&Number(step.expectedStatus)<300){const route=(routes as unknown as SchemaRoute[]).find(route=>route.method+' '+normalizedPath(route.path)===key)!;if(step.expectedStatus!==route.successStatus)invalid('Successful workflow status disagrees with its route.');if(route.requestModel)validateExample(models as ApplicationSchema['models'],route.requestModel,step.body);covered.add(key);}
  }
  if(!assertions)invalid('Each workflow needs response assertions, not status checks alone.');
 }
 if([...routeKeys].some(key=>!covered.has(key)))invalid('Every approved route needs a successful workflow step.');
 return structuredClone(root) as ApplicationSchema;
}

const py=(value:unknown):string=>value===null?'None':typeof value==='boolean'?value?'True':'False':JSON.stringify(value);
export function generateSchemaBindings(input:ApplicationSchema):Array<{path:string;content:string}>{
 const schema=validateApplicationSchema(input);const ts=['// Generated from shared/application-schema.json; do not redefine these contracts.'];
 const python=[`"""Generated from shared/application-schema.json. Do not redefine contract fields."""\nfrom typing import Literal\nfrom datetime import date, datetime\nfrom pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer\n\nclass ContractModel(BaseModel):\n    model_config = ConfigDict(extra='forbid', strict=True)\n\n    @model_serializer(mode='wrap')\n    def _serialize(self, handler):\n        data = handler(self)\n        for name in self.__class__.model_fields:\n            if name not in self.model_fields_set:\n                data.pop(name, None)\n        return data\n`];
 const scalarTs=(field:SchemaItem):string=>field.type==='model'?field.model!:field.type==='integer'||field.type==='number'?'number':field.type;
 const scalarPy=(field:SchemaItem):string=>field.type==='model'?`'${field.model}'`:{string:'str',integer:'int',number:'float',boolean:'bool'}[field.type]!;
 for(const [name,model] of Object.entries(schema.models)){
  ts.push(`export interface ${name} {`);python.push(`class ${name}(ContractModel):`);
  for(const [key,field] of Object.entries(model.fields)){
   let t=field.enum?field.enum.map(value=>JSON.stringify(value)).join(' | '):field.type==='array'?`Array<${scalarTs(field.items!)}>`:scalarTs(field as SchemaItem);
   let p=field.enum?`Literal[${field.enum.map(py).join(', ')}]`:field.type==='array'?`list[${scalarPy(field.items!)}]`:scalarPy(field as SchemaItem);
   if(field.nullable)t+=' | null';if(field.nullable)p=field.type==='model'?`'${field.model} | None'`:`${p} | None`;
   ts.push(`  ${key}${field.required===false?'?':''}: ${t};`);
   const options:string[]=[];if(field.required===false)options.push('default=None');for(const [source,target] of [['minimum','ge'],['maximum','le'],['minLength','min_length'],['maxLength','max_length']] as const)if(field[source]!==undefined)options.push(`${target}=${field[source]}`);
   if(field.type==='integer'){if(field.minimum===undefined)options.push('ge=-9007199254740991');if(field.maximum===undefined)options.push('le=9007199254740991');}
   python.push(`    ${key}: ${p}${options.length?' = Field('+options.join(', ')+')':''}`);
   if(field.enum)ts.push(``);
   if(field.required===false&&!field.nullable)python.push(`\n    @field_validator('${key}', mode='before')\n    @classmethod\n    def _nonnull_${key}(cls, value):\n        if value is None:\n            raise ValueError('Explicit null is not allowed')\n        return value\n`);
   if(field.enum)python.push(`\n    @field_validator('${key}', mode='before')\n    @classmethod\n    def _enum_type_${key}(cls, value):\n        if value is not None and type(value) not in (${field.type==='number'?'int, float':field.type==='integer'?'int,':field.type==='boolean'?'bool,':'str,'}):\n            raise ValueError('Invalid enum primitive type')\n        return value\n`);
   if(field.format){const test=field.format==='date'?`if date.fromisoformat(value).isoformat() != value:\n                raise ValueError('Use ISO calendar date')`:field.format==='date-time'?`datetime.fromisoformat(value.replace('Z', '+00:00'))`:`from email_validator import validate_email\n            validate_email(value, check_deliverability=False)`;python.push(`\n    @field_validator('${key}')\n    @classmethod\n    def _format_${key}(cls, value):\n        if value is None:\n            return value\n        try:\n            ${test}\n        except (ValueError, TypeError):\n            raise ValueError('Invalid ${field.format} value') from None\n        return value\n`);}
  }
  ts.push('}');python.push('');
  for(const [key,field] of Object.entries(model.fields))if(field.enum)ts.push(`export const ${name}_${key}_VALUES = ${JSON.stringify(field.enum)} as const;`);
 }
 for(const name of Object.keys(schema.models))python.push(`${name}.model_rebuild()`);
 ts.push(`export const CONTRACT_ROUTES = ${JSON.stringify(schema.routes)} as const;`);
 ts.push(`export class ContractHttpError extends Error { status:number;details:unknown;constructor(status:number,details:unknown){super('Request failed (HTTP '+status+').');this.status=status;this.details=details;} }
async function contractFetch<T>(method:string,path:string,body:unknown,query:Record<string,string|number|boolean|undefined>,signal?:AbortSignal):Promise<T>{
 const params=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value!==undefined)params.set(key,String(value));
 const response=await fetch(path+(params.size?'?'+params.toString():''),{method,signal,credentials:'same-origin',headers:body===undefined?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(response.status===204&&response.ok)return undefined as T;
 let value:unknown;try{value=await response.json();}catch{throw new ContractHttpError(response.status,{message:'Invalid JSON response'});}
 if(!response.ok)throw new ContractHttpError(response.status,value);return value as T;
}`);
 schema.routes.forEach((route,index)=>{
  const parameters=[...route.path.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]);
  const paramsType=parameters.length?'{'+parameters.map(name=>JSON.stringify(name)+':string|number').join(';')+'}':'Record<string,never>';
  const result=route.responseModel?route.responseModel+(route.responseArray?'[]':''):'void';
  let path=JSON.stringify(route.path);for(const name of parameters)path+=`.replace(${JSON.stringify('{'+name+'}')},encodeURIComponent(String(params[${JSON.stringify(name)}])))`;
  ts.push(`export function contractRoute${index}(params:${paramsType},body:${route.requestModel??'undefined'}${route.requestModel?'':'=undefined'},query:Record<string,string|number|boolean|undefined>={},signal?:AbortSignal):Promise<${result}>{return contractFetch<${result}>(${JSON.stringify(route.method)},${path},body,query,signal);}`);
 });
 return [{path:'frontend/src/lib/contracts.ts',content:ts.join('\n')+'\n'},{path:'backend/app/schemas/generated_contracts.py',content:python.join('\n')+'\n'}];
}
