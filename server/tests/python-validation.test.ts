import assert from "node:assert/strict";
import test from "node:test";
import { validatePythonSyntax } from "../python-validation.ts";

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
