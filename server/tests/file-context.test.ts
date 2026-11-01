import test from 'node:test';
import assert from 'node:assert/strict';
import {fileDependencyContext} from '../generation/file-context.ts';

test('page dependency context preserves component props and exports but not large bodies',()=>{
  const files=[
    {path:'frontend/src/components/ProductContent.tsx',content:`import type {Item} from '../lib/api';\nexport interface Props {items:Item[];onSelect:(id:string)=>void}\nexport function Content({items,onSelect}:Props){const padding='${'large-body'.repeat(2000)}';return <main>{padding}</main>}\nexport const Footer=({name}:{name:string})=><footer>{name}</footer>;\nexport default Content;`},
    {path:'frontend/src/lib/api.ts',content:'export interface Item {id:string}; export const api=()=>fetch("/api/items");'},
  ];
  const compact=fileDependencyContext(files,'frontend/src/pages/ProductPage.tsx');
  assert.ok(compact[0].content.length<1000);
  assert.match(compact[0].content,/onSelect:\(id:string\)=>void/);
  assert.match(compact[0].content,/export function Content\(\{items,onSelect\}:Props\)/);
  assert.match(compact[0].content,/export const Footer=\(\{name\}:\{name:string\}\)=>/);
  assert.match(compact[0].content,/export default Content/);
  assert.doesNotMatch(compact[0].content,/large-body/);
  assert.equal(compact[1].content,files[1].content);
  assert.deepEqual(fileDependencyContext(files,'frontend/preview.html'),files);
  assert.deepEqual(fileDependencyContext(files,'backend/app/main.py'),files);
});
