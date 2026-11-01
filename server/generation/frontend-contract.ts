import {parse} from '@babel/parser';
import type {GeneratedFile,MasterSpecification} from '../domain.ts';
import {validateApplicationSchema} from './application-schema.ts';

type Statement=ReturnType<typeof parse>['program']['body'][number];
type Declaration=NonNullable<Extract<Statement,{type:'ExportNamedDeclaration'}>['declaration']>;
type TSInterfaceDeclaration=Extract<Declaration,{type:'TSInterfaceDeclaration'}>;
type TSTypeAliasDeclaration=Extract<Declaration,{type:'TSTypeAliasDeclaration'}>;
type TSEnumDeclaration=Extract<Declaration,{type:'TSEnumDeclaration'}>;
type TSType=NonNullable<Extract<TSInterfaceDeclaration['body']['body'][number],{type:'TSPropertySignature'}>['typeAnnotation']>['typeAnnotation'];
type Node={type:string;start?:number|null;end?:number|null};

// Syntax inspection only: never import or execute generated modules.
export function frontendTypes(files:Array<Pick<GeneratedFile,'path'|'content'>>):Record<string,Record<string,{type:string;optional:boolean}>>{
  const source=files.find(file=>file.path==='frontend/src/lib/api.ts')?.content??'';
  const result:ReturnType<typeof frontendTypes>={};
  const ast=parse(source,{sourceType:'module',plugins:['typescript']});
  const declarations=new Map<string,TSInterfaceDeclaration|TSTypeAliasDeclaration|TSEnumDeclaration>();
  const arrays=new Map<string,string[]>();
  const text=(node:Node)=>source.slice(node.start??0,node.end??0);
  for(const statement of ast.program.body){
    const declaration=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
    if(declaration?.type==='TSInterfaceDeclaration'||declaration?.type==='TSTypeAliasDeclaration'||declaration?.type==='TSEnumDeclaration')declarations.set(declaration.id.name,declaration);
    if(declaration?.type==='VariableDeclaration')for(const item of declaration.declarations){
      const value=item.init?.type==='TSAsExpression'?item.init.expression:item.init;
      if(item.id.type==='Identifier'&&item.init?.type==='TSAsExpression'&&item.init.typeAnnotation.type==='TSTypeReference'&&item.init.typeAnnotation.typeName.type==='Identifier'&&item.init.typeAnnotation.typeName.name==='const'&&value?.type==='ArrayExpression'&&value.elements.length&&value.elements.every(element=>element?.type==='StringLiteral'||element?.type==='NumericLiteral'||element?.type==='BooleanLiteral'))arrays.set(item.id.name,value.elements.map(element=>JSON.stringify((element as {value:string|number|boolean}).value)));
    }
  }
  function enumValues(node:TSEnumDeclaration):string|undefined{
    const values:string[]=[];let next=0;
    for(const member of node.members){
      const value=member.initializer;
      if(!value){if(!Number.isFinite(next))return;values.push(String(next++));}
      else if(value.type==='NumericLiteral'){values.push(String(value.value));next=value.value+1;}
      else if(value.type==='StringLiteral'){values.push(JSON.stringify(value.value));next=NaN;}
      else return;
    }
    return values.length?values.join(' | '):undefined;
  }
  const resolvedAliases=new Map<string,string>();
  function resolve(node:TSType,seen=new Set<string>()):string{
    if(seen.size>24)return text(node);
    if(node.type==='TSTypeReference'&&node.typeName.type==='Identifier'){
      const name=node.typeName.name,declaration=declarations.get(name);
      if(!seen.has(name)&&!node.typeParameters){
        const cached=resolvedAliases.get(name);if(cached!==undefined)return cached;
        const next=new Set([...seen,name]);
        if(declaration?.type==='TSTypeAliasDeclaration'){const value=resolve(declaration.typeAnnotation,next);resolvedAliases.set(name,value);return value;}
        if(declaration?.type==='TSEnumDeclaration')return enumValues(declaration)??text(node);
      }
    }
    if(node.type==='TSIndexedAccessType'&&node.indexType.type==='TSNumberKeyword'&&node.objectType.type==='TSTypeQuery'&&node.objectType.exprName.type==='Identifier'){
      const values=arrays.get(node.objectType.exprName.name);if(values)return values.join(' | ');
    }
    // Replace nested aliases without executing any initializer or losing source syntax.
    const replacements:Array<{start:number;end:number;value:string}>=[];
    const visit=(value:unknown):void=>{
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value)){value.forEach(visit);return;}
      const child=value as Node;
      if(child!==node&&(child.type==='TSTypeReference'||child.type==='TSIndexedAccessType')){
        const resolved=resolve(child as TSType,seen);if(resolved!==text(child)){replacements.push({start:child.start!,end:child.end!,value:`(${resolved})`});return;}
      }
      for(const [key,item] of Object.entries(value))if(!['loc','start','end','extra','comments','leadingComments','trailingComments'].includes(key))visit(item);
    };
    visit(node);let value=text(node);for(const replacement of replacements.sort((a,b)=>b.start-a.start)){if(value.length+replacement.value.length-(replacement.end-replacement.start)>16000)return text(node);value=value.slice(0,replacement.start-node.start!)+replacement.value+value.slice(replacement.end-node.start!);}return value;
  }
  function fieldsFor(name:string,seen=new Set<string>()):ReturnType<typeof frontendTypes>[string]{
    if(seen.has(name))return {};
    const declaration=declarations.get(name),next=new Set([...seen,name]);
    const fields:Record<string,{type:string;optional:boolean}>={};
    const collect=(node:TSType):void=>{
      if(node.type==='TSTypeReference'&&node.typeName.type==='Identifier'){Object.assign(fields,fieldsFor(node.typeName.name,next));return;}
      if(node.type==='TSIntersectionType'){node.types.forEach(collect);return;}
      if(node.type==='TSTypeLiteral')members(node.members);
    };
    const members=(items:Extract<TSType,{type:'TSTypeLiteral'}>['members'])=>{
    for(const member of items){
      if(member.type!=='TSPropertySignature'||!member.typeAnnotation)continue;
      const key=member.key.type==='Identifier'?member.key.name:member.key.type==='StringLiteral'?member.key.value:undefined;
      const annotation=member.typeAnnotation.typeAnnotation;
      if(key)fields[key]={type:resolve(annotation),optional:Boolean(member.optional)};
    }
    };
    if(declaration?.type==='TSInterfaceDeclaration'){
      for(const parent of declaration.extends??[])if(parent.expression.type==='Identifier')Object.assign(fields,fieldsFor(parent.expression.name,next));
      members(declaration.body.body);
    }else if(declaration?.type==='TSTypeAliasDeclaration')collect(declaration.typeAnnotation);
    return fields;
  }
  for(const name of declarations.keys()){const fields=fieldsFor(name);if(Object.keys(fields).length)result[name]=fields;}
  return result;
}

export function withFrontendContract(specification:MasterSpecification,files:Array<Pick<GeneratedFile,'path'|'content'>>):MasterSpecification{
  const schema=files.find(file=>file.path==='shared/application-schema.json');
  return {...specification,implementationContext:{...specification.implementationContext,frontendTypes:frontendTypes(files),...(schema?{applicationSchema:validateApplicationSchema(JSON.parse(schema.content),specification.architecture.backend.routes?.filter(route=>!/^GET\s+\/health\s*$/i.test(route)))}:{})}};
}
