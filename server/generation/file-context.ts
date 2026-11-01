import {parse} from '@babel/parser';
import {compactStitchReference} from './master-prompt.ts';

type SourceFile={path:string;content:string};

// Dependency contracts need exports and types, not copies of every handler body.
export function fileDependencyContext(files:SourceFile[],target:string):SourceFile[]{
  if(target.endsWith('preview.html')||target.endsWith('.py'))return files;
  return files.map(file=>{
    if(file.path==='shared/application-schema.json'){
      const schema=JSON.parse(file.content);return {path:file.path,content:JSON.stringify({version:schema.version,models:schema.models,routes:schema.routes})};
    }
    if(file.path.endsWith('/lib/api.ts')||file.path.endsWith('/lib/contracts.ts'))return file;
    if(file.path.endsWith('.css'))return {path:file.path,content:compactStitchReference(`<style>${file.content}</style>`)};
    if(!/\.tsx?$/.test(file.path))return {path:file.path,content:'Generated separately; use the approved paths and build toolchain.'};
    const ast=parse(file.content,{sourceType:'module',plugins:['typescript','jsx']});
    const signatures:string[]=[];
    for(const statement of ast.program.body){
      if(statement.type==='ImportDeclaration'){signatures.push(file.content.slice(statement.start!,statement.end!));continue;}
      const declaration=statement.type==='ExportNamedDeclaration'||statement.type==='ExportDefaultDeclaration'?statement.declaration:statement;
      if(!declaration)continue;
      if(declaration.type==='TSInterfaceDeclaration'||declaration.type==='TSTypeAliasDeclaration')signatures.push(file.content.slice(statement.start!,statement.end!));
      else if(declaration.type==='FunctionDeclaration'&&declaration.body)signatures.push(file.content.slice(statement.start!,declaration.body.start!)+'{ /* implementation omitted */ }');
      else if(declaration.type==='VariableDeclaration'&&(statement.type==='ExportNamedDeclaration'||statement.type==='ExportDefaultDeclaration')){
        for(const item of declaration.declarations){
          if(item.init?.type==='ArrowFunctionExpression'||item.init?.type==='FunctionExpression')signatures.push(file.content.slice(statement.start!,item.init.body.start!)+'{ /* implementation omitted */ }');
          else if(item.id.type==='Identifier')signatures.push(`export ${declaration.kind} ${file.content.slice(item.id.start!,item.id.end!)}; // implementation omitted`);
        }
      }else if(statement.type==='ExportDefaultDeclaration'||statement.type==='ExportNamedDeclaration')signatures.push(file.content.slice(statement.start!,statement.end!));
    }
    return {path:file.path,content:signatures.join('\n')};
  });
}
