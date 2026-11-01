import {execFile} from 'node:child_process';
const script=`import ast,json,sys
class Signatures(ast.NodeTransformer):
 def visit_FunctionDef(self,node):
  node.body=[ast.Pass()];return node
 def visit_AsyncFunctionDef(self,node):
  node.body=[ast.Pass()];return node
result=[]
for file in json.load(sys.stdin):
 tree=Signatures().visit(ast.parse(file['content']))
 result.append({'path':file['path'],'content':ast.unparse(tree)})
print(json.dumps(result))`;
export function pythonDependencyContext(files:Array<{path:string;content:string}>):Promise<Array<{path:string;content:string}>>{
 return new Promise((resolve,reject)=>{const child=execFile(process.env.FORGEWEB_PYTHON_EXECUTABLE??'python',['-I','-S','-c',script],{windowsHide:true,timeout:10000,maxBuffer:512000},(error,stdout)=>{if(error)return reject(error);try{resolve(JSON.parse(stdout));}catch(error){reject(error);}});child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify(files));});
}
