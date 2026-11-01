import {parse} from '@babel/parser';
type Node={type?:string;[key:string]:unknown};
export function schemaClientIssues(files:Array<{path:string;content:string}>):string[]{
 if(!files.some(file=>file.path==='shared/application-schema.json'))return [];
 const issues:string[]=[];let calls=0;
 for(const file of files.filter(file=>/^frontend\/src\/.*\.[tj]sx?$/.test(file.path)&&file.path!=='frontend/src/lib/contracts.ts'&&!file.path.endsWith('.d.ts'))){
  let ast;try{ast=parse(file.content,{sourceType:'module',plugins:['typescript','jsx']});}catch{issues.push(file.path+': invalid frontend source');continue;}
  const helpers=new Set<string>(),namespaces=new Set<string>();
  for(const statement of ast.program.body)if(statement.type==='ImportDeclaration'){
   if(/(?:^|\/)contracts$/.test(statement.source.value))for(const item of statement.specifiers){if(item.type==='ImportNamespaceSpecifier')namespaces.add(item.local.name);if(item.type==='ImportSpecifier'&&/^contractRoute\d+$/.test(item.imported.type==='Identifier'?item.imported.name:item.imported.value))helpers.add(item.local.name);}
   if(/axios|superagent|node-fetch|undici/.test(statement.source.value))issues.push(file.path+': use generated HTTP bindings instead of an independent HTTP client');
  }
  const walk=(value:unknown):void=>{
   if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object')return;const node=value as Node;
   if(node.type==='CallExpression'||node.type==='NewExpression'){
    const callee=node.callee as Node,object=callee?.object as Node,property=callee?.property as Node;
    const name=callee?.type==='Identifier'?String(callee.name):String(property?.name??property?.value??'');
    if(['fetch','XMLHttpRequest','WebSocket','EventSource','sendBeacon'].includes(name))issues.push(file.path+': raw network access bypasses the canonical HTTP bindings');
    if(callee?.type==='Identifier'&&helpers.has(name)||callee?.type==='MemberExpression'&&namespaces.has(String(object?.name))&&/^contractRoute\d+$/.test(name))calls++;
   }
   for(const [key,child] of Object.entries(node))if(!['loc','start','end','comments','tokens'].includes(key))walk(child);
  };walk(ast);
 }
 if(!calls)issues.push('Frontend must invoke generated contractRouteN HTTP helpers; importing DTOs alone does not verify API mapping.');
 return [...new Set(issues)];
}
