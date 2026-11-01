import { execFile } from "node:child_process";
import type { GeneratedFile, ValidationCheck } from "./domain.ts";
import { id } from "./lib.ts";
import { frontendTypes } from './generation/frontend-contract.ts';

// compile() checks syntax but never imports or executes generated code. Input is
// passed through stdin, not interpolated into a command or written to the host.
const CHECK = `import json,sys,ast
errors=[]
payload=json.load(sys.stdin)
files=payload['files']
modules={}
for item in files:
 module=item['path'].removesuffix('.py').replace('/','.')
 if module.startswith('backend.'): module=module[len('backend.'):]
 if module.endswith('.__init__'): module=module[:-len('.__init__')]
 modules[module]=item
for item in files:
 try: compile(item['content'], item['path'], 'exec')
 except (SyntaxError, ValueError) as e: errors.append(item['path'] + ':' + str(getattr(e,'lineno',0)) + ':' + str(getattr(e,'offset',0)) + ': invalid Python syntax: ' + str(getattr(e,'msg',type(e).__name__))[:250])
if payload['links'] and not errors:
 classes={}
 bases={}
 aliases={}
 enums={}
 for item in files:
  if item['path'].endswith(('models/domain.py','schemas/contracts.py')):
   for node in ast.parse(item['content']).body:
    if isinstance(node,ast.ImportFrom) and node.module in {'datetime','pydantic','typing'}:
     for imported in node.names:
      if imported.asname: aliases[imported.asname]=ast.Name(id=imported.name)
    if isinstance(node,ast.Assign):
     for target in node.targets:
      if isinstance(target,ast.Name): aliases[target.id]=node.value
    if isinstance(node,ast.ClassDef):
     if any(ast.unparse(base).split('.')[-1] in {'Enum','StrEnum','IntEnum'} for base in node.bases):
      members={}
      for member in node.body:
       if isinstance(member,ast.Assign) and isinstance(member.value,ast.Constant) and type(member.value.value) in {str,int,float,bool}:
        for target in member.targets:
         if isinstance(target,ast.Name): members[target.id]=member.value.value
       elif isinstance(member,(ast.Assign,ast.AnnAssign)): members=None;break
      if members: enums[node.name]=members
     classes[node.name]={field.target.id:field.annotation for field in node.body if isinstance(field,ast.AnnAssign) and isinstance(field.target,ast.Name)}
     for field in node.body:
      if isinstance(field,ast.AnnAssign) and isinstance(field.value,ast.Call):
       for keyword in field.value.keywords:
        if keyword.arg in {'alias','serialization_alias'} and isinstance(keyword.value,ast.Constant) and isinstance(keyword.value.value,str): classes[node.name][keyword.value.value]=field.annotation
     bases[node.name]=[base.id for base in node.bases if isinstance(base,ast.Name)]
 def inherited(name,seen=None):
  seen=set() if seen is None else set(seen)
  if name in seen: return {}
  seen.add(name)
  result={}
  for base in bases.get(name,[]): result.update(inherited(base,seen))
  result.update(classes.get(name,{}))
  return result
 def scalar_types(node,seen=None):
  seen=set() if seen is None else set(seen)
  if isinstance(node,ast.Name):
   if node.id in enums: return {type(value).__name__ for value in enums[node.id].values()}
   if node.id in aliases and node.id not in seen: return scalar_types(aliases[node.id],seen|{node.id})
   return {{'StrictBool':'bool','StrictStr':'str','StrictInt':'int','StrictFloat':'float'}.get(node.id,node.id)}
  if isinstance(node,ast.Constant) and isinstance(node.value,str):
   try: return scalar_types(ast.parse(node.value,mode='eval').body,seen)
   except SyntaxError: return set()
  if isinstance(node,ast.Subscript):
   wrapper=ast.unparse(node.value).split('.')[-1]
   if wrapper=='Annotated': return scalar_types(node.slice.elts[0] if isinstance(node.slice,ast.Tuple) else node.slice,seen)
   if wrapper=='Literal':
    values=node.slice.elts if isinstance(node.slice,ast.Tuple) else [node.slice]
    return {type(value.value).__name__ for value in values if isinstance(value,ast.Constant)}
   if wrapper in {'Optional','Union'}:
    values=node.slice.elts if isinstance(node.slice,ast.Tuple) else [node.slice]
    return set().union(*(scalar_types(value,seen) for value in values))
  if isinstance(node,ast.BinOp) and isinstance(node.op,ast.BitOr): return scalar_types(node.left,seen)|scalar_types(node.right,seen)
  return set()
 finite_cache={}
 def finite_values(node,seen=None,annotation=False):
  seen=set() if seen is None else set(seen)
  if len(seen)>24: return None
  def tagged(value): return ('number' if type(value) in {int,float} else type(value).__name__,value)
  if annotation and isinstance(node,ast.Constant) and isinstance(node.value,str):
   try: return finite_values(ast.parse(node.value,mode='eval').body,seen,True)
   except SyntaxError: return None
  if isinstance(node,ast.Constant) and type(node.value) in {str,int,float,bool,type(None)}: return {tagged(node.value)}
  if isinstance(node,ast.Name):
   if node.id in seen: return None
   if node.id in enums: return {tagged(value) for value in enums[node.id].values()}
   if node.id in aliases:
    if node.id not in finite_cache: finite_cache[node.id]=finite_values(aliases[node.id],seen|{node.id},True)
    return finite_cache[node.id]
   if not annotation and node.id in {'true','false','null'}: return {tagged({'true':True,'false':False,'null':None}[node.id])}
   return None
  if isinstance(node,ast.Attribute) and isinstance(node.value,ast.Name) and node.value.id in enums and node.attr in enums[node.value.id]: return {tagged(enums[node.value.id][node.attr])}
  if isinstance(node,ast.UnaryOp) and isinstance(node.op,ast.USub) and isinstance(node.operand,ast.Constant) and type(node.operand.value) in {int,float}: return {tagged(-node.operand.value)}
  if isinstance(node,ast.Subscript):
   wrapper=ast.unparse(node.value).split('.')[-1]
   if wrapper=='Annotated': return finite_values(node.slice.elts[0] if isinstance(node.slice,ast.Tuple) else node.slice,seen,True)
   if wrapper in {'Literal','Union','Optional'}:
    values=node.slice.elts if isinstance(node.slice,ast.Tuple) else [node.slice]
    parts=[finite_values(value,seen,wrapper!='Literal') for value in values]
    if any(part is None for part in parts): return None
    result=set().union(*parts)
    if wrapper=='Optional': result.add(tagged(None))
    return result
  if isinstance(node,ast.BinOp) and isinstance(node.op,ast.BitOr):
   left,right=finite_values(node.left,seen,annotation),finite_values(node.right,seen,annotation)
   return None if left is None or right is None else left|right
  return None
 for name,fields in payload.get('frontendTypes',{}).items():
  response=inherited(name+'Response' if name+'Response' in classes else name)
  if response:
   for field,definition in fields.items():
    if field not in response and not definition['optional']: errors.append('JSON contract '+name+'.'+field+': missing required frontend response field')
    if field in response:
     expected=definition['type']
     annotation=ast.unparse(response[field])
     try: expected_values=finite_values(ast.parse(expected,mode='eval').body)
     except SyntaxError: expected_values=None
     actual_values=finite_values(response[field],annotation=True)
     if expected_values is not None and actual_values is not None and expected_values!=actual_values: errors.append('JSON contract '+name+'.'+field+': finite allowed values differ between frontend and backend')
     if expected_values is not None and actual_values is None and scalar_types(response[field]) & {'str','int','float','bool'}: errors.append('JSON contract '+name+'.'+field+': frontend requires finite allowed values but backend is unconstrained')
     if expected in {'string','number','boolean'}:
      supported={'string':{'str','date','datetime'},'number':{'int','float'},'boolean':{'bool'}}[expected]
      if not scalar_types(response[field]) & supported: errors.append('JSON contract '+name+'.'+field+': expected '+expected+', backend declares '+annotation)
 for module,item in modules.items():
  tree=ast.parse(item['content'])
  repositories={'repository','repo'}
  for node in ast.walk(tree):
   if isinstance(node,ast.ImportFrom):
    target=node.module or ''
    if node.level:
     package=module if item['path'].endswith('/__init__.py') else module.rsplit('.',1)[0]
     parent=package.split('.')
     target='.'.join(parent[:len(parent)-node.level+1]+([target] if target else []))
    if target.startswith('backend.'): target=target[len('backend.'):]
    if target=='app' or target.startswith('app.'):
     if target not in modules and not any(key.startswith(target+'.') for key in modules):
      errors.append(item['path']+':'+str(node.lineno)+': missing local module '+target)
     for alias in node.names:
      if alias.name=='repository': repositories.add(alias.asname or alias.name)
   elif isinstance(node,ast.Import):
    for alias in node.names:
     target=alias.name.removeprefix('backend.')
     if target.startswith('app.') and target not in modules and not any(key.startswith(target+'.') for key in modules):
      errors.append(item['path']+':'+str(node.lineno)+': missing local module '+target)
   if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name) and node.func.value.id in repositories:
    if node.func.attr not in {'list','get','save','delete','connect'}:
     errors.append(item['path']+':'+str(node.lineno)+': unsupported repository method '+node.func.attr)
   if isinstance(node,ast.Call) and any(isinstance(arg,ast.Name) and arg.id=='CORSMiddleware' for arg in node.args):
    options={arg.arg:arg.value for arg in node.keywords}
    origins=options.get('allow_origins')
    credentials=options.get('allow_credentials')
    if isinstance(origins,(ast.List,ast.Tuple)) and any(isinstance(value,ast.Constant) and value.value=='*' for value in origins.elts) and isinstance(credentials,ast.Constant) and credentials.value is True: errors.append(item['path']+': unsafe wildcard CORS with credentials')
print(json.dumps(errors))`;

export async function validatePythonSyntax(files: GeneratedFile[], executable = process.env.FORGEWEB_PYTHON_EXECUTABLE ?? "python"): Promise<ValidationCheck> {
  return checkPython(files,executable,false);
}

export async function validatePythonModuleLinks(files: GeneratedFile[], executable = process.env.FORGEWEB_PYTHON_EXECUTABLE ?? "python"): Promise<ValidationCheck> {
  return checkPython(files,executable,true);
}

async function checkPython(files:GeneratedFile[], executable:string, links:boolean):Promise<ValidationCheck>{
  const python = files.filter((file) => file.path.endsWith(".py")).map(({ path, content }) => ({ path, content }));
  const result = (passed: boolean, evidence: string): ValidationCheck => ({ id: id("check"), name: links ? "Python module links" : "Python syntax", status: passed ? "passed" : "failed", evidence });
  if (!python.length) return result(true, "No Python source files in this project.");
  let types:ReturnType<typeof frontendTypes>={};
  if(links){try{types=frontendTypes(files);}catch{return result(false,'Frontend API contract cannot be parsed; repair its TypeScript syntax before validating backend links.');}}
  return new Promise((resolve) => {
    const child = execFile(executable, ["-I", "-S", "-c", CHECK], { timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) { resolve(result(false, "Python syntax checker unavailable or timed out. Install Python 3 or set FORGEWEB_PYTHON_EXECUTABLE; export remains blocked.")); return; }
      try {
        const errors: unknown = JSON.parse(stdout);
        if (!Array.isArray(errors) || !errors.every((item) => typeof item === "string")) throw new Error("Invalid checker response");
        resolve(result(errors.length === 0, errors.length ? errors.join("; ") : `${python.length} Python files checked ${links?'for local module links and repository methods':'for syntax'} without execution. Runtime behavior is not verified.`));
      } catch { resolve(result(false, "Python syntax checker returned an invalid result; export remains blocked.")); }
    });
    child.stdin?.on("error", () => { /* execFile callback reports process failure. */ });
    child.stdin?.end(JSON.stringify({files:python,links,frontendTypes:types}));
  });
}
