import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeCodeGraph,codeGraphLayout,graphCommunities,type CodeGraph} from '../../src/lib/code-graph.ts';
test('public graph preserves topology and provenance without source bodies or arbitrary metadata',()=>{
 const graph=sanitizeCodeGraph({nodes:[{id:'a',label:'App',source_file:'src/App.tsx',community:1,content:'private source',metadata:{secret:'private'}},{id:'b',label:'ref_react',source_file:'',external:true},{id:'c',source_file:'.env'}],links:[{source:'a',target:'b',relation:'imports',confidence:'EXTRACTED',confidence_score:1},{source:'a',target:'c'}]},['src/App.tsx']);
 assert.equal(graph.nodes.length,2);assert.equal(graph.links.length,1);assert.equal(graph.links[0].confidence,'EXTRACTED');assert.equal(JSON.stringify(graph).includes('private'),false);assert.equal(JSON.stringify(graph).includes('.env'),false);
});
test('graph layout is deterministic, finite, complete and does not mutate topology',()=>{
 const graph={nodes:Array.from({length:100},(_,i)=>({id:String(i),label:'Symbol '+i,file:'src/App.tsx',line:'L1',community:i%5,external:false})),links:[]} as unknown as CodeGraph;
 const first=codeGraphLayout(graph.nodes);assert.equal(first.size,100);assert.deepEqual(first,codeGraphLayout(graph.nodes));assert.ok([...first.values()].flat().every(Number.isFinite));assert.equal(graphCommunities(graph).reduce((sum,c)=>sum+c.count,0),100);assert.equal(codeGraphLayout([]).size,0);
});
test('invalid graphs and duplicate symbols fail explicitly rather than silently sampling',()=>{
 assert.throws(()=>sanitizeCodeGraph({},[]),/schema/);assert.throws(()=>sanitizeCodeGraph({nodes:[{id:'a',external:true},{id:'a',external:true}],links:[]},[]),/Duplicate/);
});
