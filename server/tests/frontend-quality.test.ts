import assert from 'node:assert/strict';
import test from 'node:test';
import {frontendAccessibilityIssues,frontendSourceIssues} from '../generation/frontend-quality.ts';
import {frontendToolchainIssues} from '../generation/frontend-toolchain.ts';
import {createGenerationProviderFromEnv} from '../providers/generation-provider.ts';
import type {MasterSpecification} from '../domain.ts';

const files=(content:string)=>[{path:'frontend/src/components/Form.tsx',content}];
test('the live unassociated form-label and placeholder-footer defects fail source quality checks',()=>{
  const issues=frontendSourceIssues(files('<><form onSubmit={send}><label>Name</label><input required/><label>Email</label><input type="email"/><label>Message</label><textarea/><button>Send</button></form><footer><a href="#">Instagram</a></footer></>'));
  assert.equal(issues.filter(issue=>issue.includes('associated accessible label')).length,2,'Repeated same-kind issues are deduplicated per file');
  assert.equal(issues.filter(issue=>issue.includes('placeholder destination')).length,1);
});
test('native label association, wrapping and explicit accessible names are recognized',()=>{
  const source='<><label htmlFor="name">Name</label><input id="name"/><label>Email<input type="email"/></label><textarea aria-label="Message"/><select aria-label="Time" onChange={change}/><input type="hidden"/></>';
  assert.deepEqual(frontendAccessibilityIssues(files(source)),[]);
  assert.deepEqual(frontendAccessibilityIssues(files('<><label htmlFor={fieldId}>Name</label><input id={fieldId}/></>')),[]);
});
test('empty labels and wrong explicit label targets do not hide inaccessible controls',()=>{
  assert.equal(frontendAccessibilityIssues(files('<><label htmlFor="x"></label><input id="x"/></>')).length,1);
  assert.equal(frontendAccessibilityIssues(files('<label htmlFor="other">Name<input id="x"/></label>')).length,1);
  assert.equal(frontendAccessibilityIssues(files('<input aria-label=""/>')).length,1);
});
test('nonplaceholder anchors and real click actions are not rejected as dead links',()=>{
  assert.deepEqual(frontendSourceIssues(files('<><a href="#contact">Contact</a><a href="https://example.com">Profile</a><a href="#" onClick={open}>Open</a></>')),[]);
});

test('received legacy Vite versions fail the generated toolchain gate without claiming an entire security audit',()=>{
  const manifest=(pkg:unknown)=>[{path:'package.json',content:JSON.stringify(pkg)}];
  assert.match(frontendToolchainIssues(manifest({devDependencies:{vite:'^4.4.0'}}))[0],/reviewed 8.2.4/);
  assert.deepEqual(frontendToolchainIssues(manifest({devDependencies:{vite:'8.2.4','@vitejs/plugin-react':'6.0.5'}})),[]);
  assert.equal(frontendToolchainIssues(manifest({devDependencies:{vite:'8.2.4','@vitejs/plugin-react':'^4.0.0'}})).length,1);
  assert.equal(frontendToolchainIssues(manifest({dependencies:{vite:'4.4.0'},devDependencies:{vite:'8.2.4'}})).length,1);
});

test('Groq JSON-object compatibility fallback cannot bypass frontend quality checks or start the backend',async(t)=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    if(++calls===1)return new Response(JSON.stringify({error:{message:'Failed to generate JSON',code:'json_validate_failed'}}),{status:400});
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path:'frontend/src/App.tsx',content:'<a href="#">Dead</a>',requirementIds:['REQ-1']}]})}}]});
  });
  const provider=createGenerationProviderFromEnv({FORGEWEB_GENERATION_MODE:'groq',FORGEWEB_GROQ_FILE_MODE:'false',GROQ_API_KEY:'test-key'})!;
  const specification={productName:'QA',prompt:'Build a portfolio',requirements:[{id:'REQ-1'}],architecture:{frontend:{pages:[],components:[]},backend:{modules:[],routes:[]},data:{rules:[]}}} as unknown as MasterSpecification;
  await assert.rejects(provider.generate(specification),/placeholder destination/);
  assert.equal(calls,2);
});
