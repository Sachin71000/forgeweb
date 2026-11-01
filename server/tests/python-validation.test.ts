import assert from "node:assert/strict";
import test from "node:test";
import { validatePythonSyntax, validatePythonModuleLinks } from "../python-validation.ts";

const files = (content: string) => [{ path: "backend/app/main.py", content, requirementIds: [], digest: "test" }];

test("Python syntax validation compiles without running generated code", async () => {
  assert.equal((await validatePythonSyntax(files('raise RuntimeError("must never execute")'))).status, "passed");
});

test("Python syntax validation rejects malformed code and module-level return", async () => {
  for (const source of ["def invalid(:", "return 42"]) {
    assert.equal((await validatePythonSyntax(files(source))).status, "failed");
  }
});

test("Python syntax validation fails closed when the interpreter is unavailable", async () => {
  assert.equal((await validatePythonSyntax(files("x = 1"), "forgeweb-missing-python-executable")).status, "failed");
});

test('Python link gate finds missing database imports and invented repository methods without execution',async()=>{
  const checked=await validatePythonModuleLinks(files('from app.database import Base\nrepo.create({})\nraise RuntimeError("must not run")'));
  assert.equal(checked.status,'failed');
  assert.match(checked.evidence,/missing local module app.database/);
  assert.match(checked.evidence,/unsupported repository method create/);
});

test('Python link gate accepts namespace packages and existing relative/absolute module imports',async()=>{
  const input=[...files('from app.models.domain import Task\nfrom backend.app.models.domain import Task as T\nfrom .models.domain import Task as U\nraise RuntimeError("must not run")'),{path:'backend/app/models/domain.py',content:'class Task: pass',digest:'test',requirementIds:[]}];
  assert.equal((await validatePythonModuleLinks(input)).status,'passed');
});

test('JSON contract gate catches numeric-ID and completion-name drift from the live sample',async()=>{
  const input=[{path:'frontend/src/lib/api.ts',content:'export interface Task { id: number; completed: boolean; }',digest:'test',requirementIds:[]},{path:'backend/app/schemas/contracts.py',content:'class TaskResponse:\n    id: str\n    is_completed: bool',digest:'test',requirementIds:[]}];
  const checked=await validatePythonModuleLinks(input);
  assert.equal(checked.status,'failed');
  assert.match(checked.evidence,/Task.id: expected number/);
  assert.match(checked.evidence,/Task.completed: missing required/);
});

test('JSON contract gate accepts matching primitives and rejects credentialed wildcard CORS',async()=>{
  const input=[{path:'frontend/src/lib/api.ts',content:'export interface Task { id: string; completed: boolean; }',digest:'test',requirementIds:[]},{path:'backend/app/schemas/contracts.py',content:'class TaskResponse:\n    id: str\n    completed: bool',digest:'test',requirementIds:[]}];
  assert.equal((await validatePythonModuleLinks(input)).status,'passed');
  const cors=await validatePythonModuleLinks(files("app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_credentials=True)"));
  assert.equal(cors.status,'failed');
  assert.match(cors.evidence,/unsafe wildcard CORS/);
});
