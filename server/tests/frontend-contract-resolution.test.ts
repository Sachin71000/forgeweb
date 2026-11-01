import test from 'node:test';
import assert from 'node:assert/strict';
import {frontendTypes,withFrontendContract} from '../generation/frontend-contract.ts';
import type {MasterSpecification} from '../domain.ts';

const extract=(content:string)=>frontendTypes([{path:'frontend/src/lib/api.ts',content}]);

test('API scalar aliases and finite enum values survive frontend-to-backend handoff',()=>{
 const types=extract(`export type Id=number; type Money=Id; export type Category='Food & dining' | 'Housing & bills'; export enum Priority {Low='low',High='high'} interface Expense {id:Money; category:Category; priority?:Priority; notes:string|null}`);
 assert.equal(types.Expense.id.type,'number');
 assert.equal(types.Expense.category.type,"'Food & dining' | 'Housing & bills'");
 assert.equal(types.Expense.priority.type,'"low" | "high"');
 assert.equal(types.Expense.priority.optional,true);
 assert.equal(types.Expense.notes.type,'string|null');
 const result=withFrontendContract({implementationContext:{}} as MasterSpecification,[{path:'frontend/src/lib/api.ts',content:"type Category='Food & dining'|'Housing & bills'; interface Expense{category:Category}"}]);
 assert.match(result.implementationContext!.frontendTypes.Expense.category.type,/Food & dining/);
});

test('const tuple indexed values, nested aliases, arrays and numeric enums remain explicit',()=>{
 const types=extract(`export const CATEGORIES=['Food & dining','Transport'] as const;type Category=typeof CATEGORIES[number]; enum Status{New,Active=3,Done} interface Expense{category:Category;categories:Category[]; nullable:Category|null; status:Status;meta:{category:Category}}`);
 assert.equal(types.Expense.category.type,'"Food & dining" | "Transport"');
 assert.equal(types.Expense.categories.type,'("Food & dining" | "Transport")[]');
 assert.equal(types.Expense.nullable.type,'("Food & dining" | "Transport")|null');
 assert.equal(types.Expense.status.type,'0 | 3 | 4');
 assert.equal(types.Expense.meta.type,'{category:("Food & dining" | "Transport")}');
});

test('inherited interfaces and object intersections include required and optional fields',()=>{
 const types=extract('interface Base {id:number; note?:string} interface Expense extends Base {amountPaise:number} type Write = Base & { category: string; dueDate?:string|null };');
 assert.deepEqual(types.Expense,{id:{type:'number',optional:false},note:{type:'string',optional:true},amountPaise:{type:'number',optional:false}});
 assert.equal(types.Write.id.type,'number');assert.equal(types.Write.dueDate.optional,true);
});

test('cycles, unresolved imported types, computed enums and dynamic arrays are not guessed or executed',()=>{
 const types=extract(`type First=Second;type Second=First; const cats=executeUnsafe();enum Dynamic{A=executeUnsafe()} interface Expense{cycle:First; external:ImportedType; category:typeof cats[number]; dynamic:Dynamic};executeUnsafe();`);
 assert.equal(types.Expense.cycle.type,'First');assert.equal(types.Expense.external.type,'ImportedType');assert.equal(types.Expense.category.type,'typeof cats[number]');assert.equal(types.Expense.dynamic.type,'Dynamic');
 assert.doesNotMatch(JSON.stringify(types),/executeUnsafe/);
});

test('no category values are invented for an unconstrained string alias',()=>{
 const types=extract('export type Category=string;interface Expense{category:Category}');assert.equal(types.Expense.category.type,'string');
});

test('expanding alias graphs are bounded rather than growing request context exponentially',()=>{const aliases=["type A0='value';",...Array.from({length:28},(_,i)=>`type A${i+1}=A${i}|A${i};`)];const types=extract(aliases.join('\n')+'interface Expense{category:A28}');assert.ok(types.Expense.category.type.length<=16000);});
