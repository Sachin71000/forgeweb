import assert from "node:assert/strict";
import test from "node:test";
import { workspaceFileEntries } from "../../src/lib/workspace-file-entries.ts";

const source = (path: string) => ({ path, content: `source for ${path}`, digest: "original", requirementIds: ["R1"] });
test("file viewer combines frontend and backend without changing source or other files", () => {
  const files = ["ARCHITECTURE.md", "package.json", "frontend/src/App.tsx", "frontend/src/styles.css", "backend/app/main.py", "backend/requirements.txt", "shared/api-contract.json"].map(source);
  const before = structuredClone(files);
  const entries = workspaceFileEntries(files);
  assert.deepEqual(entries.map((entry) => entry.path), ["ARCHITECTURE.md", "package.json", "Frontend", "Backend", "shared/api-contract.json"]);
  for (const file of files.filter((file) => /^(frontend|backend)\//.test(file.path))) {
    assert.ok(entries.some((entry) => entry.content.includes(file.content) && entry.content.includes(`===== ${file.path} =====`)));
  }
  assert.deepEqual(files, before);
  assert.equal(entries[0], files[0]);
  assert.deepEqual(entries[2].requirementIds, ["R1"]);
});
test("file viewer handles empty, backend-only and revised files", () => {
  assert.deepEqual(workspaceFileEntries([]), []);
  assert.equal(workspaceFileEntries([source("backend/main.py")])[0].path, "Backend");
  assert.match(workspaceFileEntries([{ ...source("frontend/App.tsx"), content: "updated" }])[0].content, /updated/);
});
