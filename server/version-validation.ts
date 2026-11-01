import type {GeneratedFile,ValidationCheck} from './domain.ts';
import {digest,id,safePath} from './lib.ts';
import {frontendSourceIssues} from './generation/frontend-quality.ts';
import {validatePythonSyntax,validatePythonModuleLinks} from './python-validation.ts';
import {schemaBindingIssues} from './generation/schema-binding-check.ts';
export function versionSourceHash(files:GeneratedFile[]){return digest(JSON.stringify(files.map(f=>[f.path,digest(f.content)]).sort((a,b)=>a[0].localeCompare(b[0]))));}
export async function sourceValidation(files:GeneratedFile[]):Promise<ValidationCheck[]>{
  const check=(name:string,passed:boolean,evidence:string):ValidationCheck=>({id:id('check'),name,status:passed?'passed':'failed',evidence});
  const paths=files.map(f=>f.path);let safe=true;try{safe=paths.every(p=>safePath(p)===p&&!/^[A-Za-z]:/.test(p))&&new Set(paths).size===paths.length;}catch{safe=false;}
  const checks=[check('Safe project paths',safe,'Unique relative generated source paths required.'),check('Full-stack entrypoints',['index.html','tsconfig.json','frontend/src/App.tsx','frontend/src/main.tsx','backend/app/main.py'].every(p=>paths.includes(p)),'React entrypoints, TypeScript configuration and FastAPI entrypoint required.')];
  if(!safe)return checks;
  if(paths.includes('shared/application-schema.json')){const issues=schemaBindingIssues(files);checks.push(check('Canonical schema bindings',!issues.length,issues.length?issues.join('\n'):'TypeScript and Pydantic bindings match the canonical schema exactly.'));}
  const issues=frontendSourceIssues(files);checks.push(check('Frontend source contracts',!issues.length,issues.length?issues.slice(0,8).join('\n'):'Frontend parser, toolchain and interaction contract checks passed.'));
  checks.push(await validatePythonSyntax(files),await validatePythonModuleLinks(files));return checks;
}
