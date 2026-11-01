import {ProjectGraphify} from '../server/project-graphify.ts';
import {digest} from '../server/lib.ts';
import {resolve} from 'node:path';
const files=[
  {path:'frontend/src/App.tsx',content:'import {api} from "./api"; export default function App(){return <button onClick={()=>api()}>Save</button>}'},
  {path:'frontend/src/api.ts',content:'export async function api(){return fetch("/api/items")}'},
  {path:'frontend/src/styles.css',content:'body{background:cream}'},
  {path:'backend/app/main.py',content:'from fastapi import FastAPI\napp=FastAPI()\n@app.get("/api/items")\ndef items():\n    return []\n'},
].map(f=>({...f,digest:digest(f.content),requirementIds:[]}));
const graph=new ProjectGraphify(resolve('.forgeweb-data/graphify-smoke'));
const {nodesData,linksData,...result}=await graph.ensure('synthetic-qa','version-1',files);
const context=await graph.context('synthetic-qa','version-1',files,'change save button background');
console.log(JSON.stringify({result,contextPaths:context.paths,contextCharacters:context.characters}));
if(result.status!=='ready'||!nodesData.length)process.exitCode=1;
