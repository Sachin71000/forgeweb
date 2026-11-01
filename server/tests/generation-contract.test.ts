import assert from 'node:assert/strict';
import test from 'node:test';
import {frontendTypes,withFrontendContract} from '../generation/frontend-contract.ts';
import {frontendStyleSupport} from '../generation/style-support.ts';
import {backendImplementationPrompt} from '../generation/master-prompt.ts';
import type {MasterSpecification} from '../domain.ts';
import {frontendInteractionIssues} from '../generation/frontend-interactions.ts';
import {hasLightCreamSurface} from '../providers/generation-provider.ts';

test('cream surface validation checks actual light warm color channels, not hex prefixes or names',()=>{
  for(const color of ['#ff0000','#ff00ff','#101010','rgb(255,0,0)'])assert.equal(hasLightCreamSurface(`<style>body{background:${color}}</style>`),false);
  assert.equal(hasLightCreamSurface('<style>:root{--cream:#ff0000}body{background:var(--cream)}</style>'),false);
  assert.equal(hasLightCreamSurface('<style>:root{--cream:#fff8ed}body{background:var(--cream)}</style>'),true);
  assert.equal(hasLightCreamSurface('<style>body{background:ivory}</style>'),true);
});

test('backend handoff includes actual frontend ID and completion fields as data, not executable source',()=>{
  const files=[{path:'frontend/src/lib/api.ts',content:'export interface Task { id: number; completed: boolean; due_date?: string; }\ninterface Complex { nested: {value:string} }\nrunUnsafe();'}];
  assert.deepEqual(frontendTypes(files),{Task:{id:{type:'number',optional:false},completed:{type:'boolean',optional:false},due_date:{type:'string',optional:true}},Complex:{nested:{type:'{value:string}',optional:false}}});
  const spec={requirements:[],architecture:{backend:{modules:[],routes:[]},data:{rules:[]}}} as unknown as MasterSpecification;
  const prompt=backendImplementationPrompt(withFrontendContract(spec,files),true);
  assert.match(prompt,/"completed":\{"type":"boolean"/);
  assert.doesNotMatch(prompt,/runUnsafe/);
});

test('Tailwind 3 directives receive required reviewed build configuration; plain CSS does not',()=>{
  const files=[{path:'frontend/src/styles.css',content:'@tailwind utilities; .card{@apply flex;}'},{path:'package.json',content:JSON.stringify({devDependencies:{tailwindcss:'^3.3.3'}})}];
  const support=frontendStyleSupport(files,['REQ-1']);
  assert.deepEqual(support.map(file=>file.path),['postcss.config.cjs','tailwind.config.cjs']);
  assert.match(support[1].content,/frontend\/src/);
  assert.deepEqual(frontendStyleSupport([{path:'frontend/src/styles.css',content:'body{color:black}'}],[]),[]);
  assert.throws(()=>frontendStyleSupport([files[0]],[]),/supported Tailwind 3/);
});

test('obvious dead create and filter controls from the live sample fail before backend generation',()=>{
  const files=[{path:'frontend/src/App.tsx',content:'<button className="btn">New Subject</button>'},{path:'frontend/src/components/TaskList.tsx',content:'<select><option>All subjects</option></select>'}];
  assert.equal(frontendInteractionIssues(files).length,2);
  assert.deepEqual(frontendInteractionIssues([{path:'frontend/src/App.tsx',content:'<><button onClick={() => setOpen(true)}>New Subject</button><select onChange={change}><option>All</option></select></>'}]),[]);
  assert.deepEqual(frontendInteractionIssues([{path:'frontend/src/Form.tsx',content:'<form onSubmit={save}><button type="submit">Save</button></form>'}]),[]);
});

test('JSX checks scope handlers to actual ancestors rather than unrelated controls',()=>{
  const check=(content:string)=>frontendInteractionIssues([{path:'frontend/src/App.tsx',content}]);
  assert.equal(check('<><form onSubmit={save}><button>Save</button><button type="button">Dead</button></form><button>Outside</button></>').length,1);
  assert.equal(check('<><div onClick={act}><button data-action="save">Save</button></div><button data-action="dead">Dead</button></>').length,1);
  assert.equal(check('<><select onChange={change}/><select/></>').length,1);
  assert.equal(check('<button onClick={()=>{}}>Empty</button>').length,1);
  assert.equal(check('<button disabled={loading}>Conditional</button>').length,1);
  assert.deepEqual(check('<form onSubmit={save}><select name="time"/><button>Save</button></form>'),[]);
  assert.deepEqual(check('const example="<button>not JSX</button>"; /* <select/> */ const x=<button disabled/>;'),[]);
});

test('DTO extraction retains comma, nested, nullable and fields beyond former silent limits',()=>{
  const declarations=Array.from({length:17},(_,i)=>`interface DTO${i} {${Array.from({length:33},(_,j)=>`field${j}: string`).join(',')}, nested: { value: number }, nullable?: string | null}`).join('\n');
  const types=frontendTypes([{path:'frontend/src/lib/api.ts',content:declarations}]);
  assert.equal(Object.keys(types).length,17);
  assert.equal(Object.keys(types.DTO16).length,35);
  assert.equal(types.DTO16.nullable.type,'string | null');
  assert.equal(types.DTO16.nullable.optional,true);
});
