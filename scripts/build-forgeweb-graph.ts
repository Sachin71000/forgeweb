import {readdir,readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest} from '../server/lib.ts';
import {renameWithRetry} from '../server/store.ts';
import {sanitizeCodeGraph,type CodeGraph} from '../src/lib/code-graph.ts';
const run=promisify(execFile),root=resolve('.'),scratch=resolve('.forgeweb-data/graph-showcase');await mkdir(scratch,{recursive:true});const temporary=await mkdtemp(join(scratch,'scan-'));
try{
 const source=join(temporary,'source'),output=join(temporary,'output');const files:string[]=[];const contents:Array<[string,string]>=[];
 async function collect(directory:string){for(const entry of await readdir(join(root,directory),{withFileTypes:true})){if(entry.isSymbolicLink())continue;const path=directory+'/'+entry.name;if(entry.isDirectory()){if(!['node_modules','.git','data','__pycache__'].includes(entry.name))await collect(path);}else if(/\.(tsx?|jsx?|py|css)$/.test(path)&&!/secret|credential|\.env/i.test(path)){files.push(path);}}}
 for(const dir of ['src','server','scripts'])await collect(dir);
 files.push('package.json','tsconfig.json','vite.config.ts');files.sort();if(files.length>500)throw new Error('Source count limit exceeded');let bytes=0;
 for(const path of files){const content=await readFile(join(root,path),'utf8');bytes+=Buffer.byteLength(content);if(bytes>12_000_000)throw new Error('Source size limit exceeded');contents.push([path,digest(content)]);const target=join(source,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,content);}
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|HOME|UV_TOOL_DIR|UV_TOOL_BIN_DIR)$/i.test(key)));
 const version=await run('graphify',['--version'],{env,windowsHide:true,timeout:10000});
 await run('graphify',['extract',source,'--code-only','--max-workers','2','--out',output],{env,windowsHide:true,timeout:90000,maxBuffer:256000});
 const raw=JSON.parse(await readFile(join(output,'graphify-out','graph.json'),'utf8'));
 const graph:CodeGraph={generatedAt:new Date().toISOString(),sourceHash:digest(JSON.stringify(contents)),graphifyVersion:version.stdout.trim(),toolRevision:'0a8cd4e1e342235fe53e881fb5d591bf0460071f',files,...sanitizeCodeGraph(raw,files)};
 if(!graph.nodes.length)throw new Error('Empty graph; preserving previous snapshot');
 await mkdir(join(root,'public'),{recursive:true});const staged=join(temporary,'published.json');await writeFile(staged,JSON.stringify(graph));await renameWithRetry(staged,join(root,'public/forgeweb-code-graph.json'));
 console.log(JSON.stringify({files:files.length,nodes:graph.nodes.length,connections:graph.links.length,originalNodes:raw.nodes.length,originalConnections:raw.links.length,communities:new Set(graph.nodes.map(n=>n.community)).size,output:'public/forgeweb-code-graph.json',llmCalls:0}));
}finally{await rm(temporary,{recursive:true,force:true});}
