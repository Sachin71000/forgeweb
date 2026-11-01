import test from 'node:test';import assert from 'node:assert/strict';import {validatePythonModuleLinks} from '../python-validation.ts';
const fixture=(frontend:string,backend:string)=>[{path:'frontend/src/lib/api.ts',content:frontend,digest:'fixture',requirementIds:[]},{path:'backend/app/models/domain.py',content:backend,digest:'fixture',requirementIds:[]}];
test('category finite values mismatch is rejected instead of passing primitive-only checking',async()=>{
 const result=await validatePythonModuleLinks(fixture("type Category='Food'|'Bills';interface Expense{category:Category}","from typing import Literal\nfrom pydantic import BaseModel\nclass Expense(BaseModel):\n category:Literal['Food & dining','Housing & bills']\n"));assert.equal(result.status,'failed');assert.match(result.evidence,/Expense.category: finite allowed values differ/);
});
test('matching enum/alias/nullable inherited contracts pass without executing Python',async()=>{
 const backend="from typing import Literal,Optional,Annotated\nfrom enum import Enum\nfrom pydantic import BaseModel\nclass Category(str,Enum):\n Food='Food & dining'\n Bills='Housing & bills'\nChoice=Annotated[Optional[Category], 'constraint']\nclass Base(BaseModel):\n category:Choice\nclass ExpenseResponse(Base):\n id:int\nraise RuntimeError('MUST NOT EXECUTE')\n";
 const result=await validatePythonModuleLinks(fixture("type Category='Food & dining'|'Housing & bills';interface Expense{category:Category|null;id:number}",backend));assert.equal(result.status,'passed',result.evidence);
});
test('general string frontend remains compatible with string enums, but finite frontend rejects plain backend strings',async()=>{
 const backend="from enum import Enum\nfrom pydantic import BaseModel\nclass Category(str,Enum):\n Food='Food'\n Bills='Bills'\nclass Expense(BaseModel):\n category:Category\n";
 const broad=await validatePythonModuleLinks(fixture('type Category=string;interface Expense{category:Category}',backend));assert.equal(broad.status,'passed',broad.evidence);
 const narrow=await validatePythonModuleLinks(fixture("interface Expense{category:'Food'|'Bills'}","from pydantic import BaseModel\nclass Expense(BaseModel):\n category:str\n"));assert.equal(narrow.status,'failed');assert.match(narrow.evidence,/backend is unconstrained/);
});
test('boolean literal values are not confused with integer 1 and unresolved references are not invented',async()=>{
 const mismatch=await validatePythonModuleLinks(fixture('interface Expense{flag:true}',"from typing import Literal\nfrom pydantic import BaseModel\nclass Expense(BaseModel):\n flag:Literal[1]\n"));assert.equal(mismatch.status,'failed');assert.match(mismatch.evidence,/finite allowed values differ/);
 const unresolved=await validatePythonModuleLinks(fixture('interface Expense{category:UnknownCategory}',"from pydantic import BaseModel\nclass Expense(BaseModel):\n category:str\n"));assert.equal(unresolved.status,'passed',unresolved.evidence);
});

test('JSON-equivalent integer and float literal values agree across TypeScript and Python',async()=>{const result=await validatePythonModuleLinks(fixture('interface Expense{value:1}',"from typing import Literal\nfrom pydantic import BaseModel\nclass Expense(BaseModel):\n value:Literal[1.0]\n"));assert.equal(result.status,'passed',result.evidence);});
