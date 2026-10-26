import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { createForgeWebServer } from "../app.ts";
import { BuildWorkflow } from "../workflow.ts";
import { JsonStore } from "../store.ts";
import { digest } from "../lib.ts";

// Acceptance checks intentionally expose unmet release requirements. Do not
// weaken assertions to make this audit green without fixing the product.
test("product release acceptance audit (isolated data, no paid providers)", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-release-audit-"));
  const store = new JsonStore(directory);
  await store.initialize();
  const workflow = new BuildWorkflow(store, 0);
  const server = createForgeWebServer(workflow);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const wait = async (id: string, states: string[]) => {
    for (let i = 0; i < 2000; i++) {
      const build = workflow.get(id);
      if (states.includes(build.status)) return build;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Audit build timed out");
  };
  try {
    await t.test("null JSON input is a client error, not HTTP 500", async () => {
      const response = await fetch(`${base}/api/builds`, { method: "POST", headers: { "content-type": "application/json" }, body: "null" });
      assert.equal(response.status, 400);
    });
    await t.test("malformed URL encoding is a client error, not HTTP 500", async () => {
      const response = await fetch(`${base}/api/projects/%ZZ`);
      assert.equal(response.status, 400);
    });
    await t.test("invalid object shapes and unsafe request origins never create builds", async () => {
      const before = Object.keys(store.read().builds).length;
      for (const input of ["[]", "42", "true", '"prompt"']) {
        assert.equal((await fetch(`${base}/api/builds`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: input })).status, 400);
      }
      for (const origin of ["https://untrusted.example", "null"]) {
        assert.equal((await fetch(`${base}/api/builds`, { method: "POST", headers: { "content-type": "application/json", origin }, body: '{}' })).status, 403);
      }
      assert.equal((await fetch(`${base}/api/builds`, { method: "POST", headers: { "content-type": "text/plain", origin: base }, body: '{}' })).status, 415);
      assert.equal(Object.keys(store.read().builds).length, before);
      assert.equal((await fetch(`${base}/api/health`, { headers: { origin: base } })).status, 200);
    });
    await t.test("cross-origin simple POST cannot trigger a billable build", async () => {
      const response = await fetch(`${base}/api/builds`, {
        method: "POST", headers: { origin: "https://untrusted.example", "content-type": "text/plain" },
        body: JSON.stringify({ prompt: "Build a cafe with menu and reservation management." }),
      });
      if (response.status === 202) {
        const payload = await response.json() as { build: { id: string } };
        await wait(payload.build.id, ["awaiting_confirmation", "failed"]);
      }
      assert.ok([403, 415].includes(response.status), `Expected rejection, received HTTP ${response.status}`);
    });
    await t.test("foreign origin cannot confirm, delete, restore, edit or export projects", async () => {
      for (const [method, path] of [["POST", "/api/builds/missing/confirm"], ["DELETE", "/api/projects/missing"], ["POST", "/api/projects/missing/versions/missing/restore"], ["POST", "/api/projects/missing/edits"], ["POST", "/api/projects/missing/export"]]) {
        const response = await fetch(`${base}${path}`, { method, headers: { origin: "https://untrusted.example" } });
        assert.equal(response.status, 403);
        assert.doesNotMatch(await response.text(), /TypeError|at .*\.ts:/);
      }
    });
    await t.test("foreign Host and cross-site mutation metadata are rejected", async () => {
      // fetch normalizes Host; use the raw HTTP client to send the hostile header.
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(`${base}/api/health`, { headers: { host: "attacker.example" } }, (response) => { response.resume(); resolve(response.statusCode); });
        request.on("error", reject);
        request.end();
      });
      assert.equal(status, 403);
      assert.equal((await fetch(`${base}/api/builds/missing/confirm`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
    });
    await t.test("50 concurrent health requests succeed without internal errors", async () => {
      const started = performance.now();
      const statuses = await Promise.all(Array.from({ length: 50 }, async () => (await fetch(`${base}/api/health`)).status));
      assert.ok(statuses.every((status) => status === 200));
      t.diagnostic(`50 local concurrent health reads: ${Math.round(performance.now() - started)} ms total (not a load-capacity benchmark)`);
    });
    await t.test("30 concurrent writes survive reopen without lost updates", async () => {
      await Promise.all(Array.from({ length: 30 }, (_, i) => store.mutate((db) => { db.events[`audit-${i}`] = []; })));
      const reopened = new JsonStore(directory);
      await reopened.initialize();
      assert.equal(Object.keys(reopened.read().events).filter((key) => key.startsWith("audit-")).length, 30);
    });
    const first = await workflow.create("Build a client portal with projects, documents and invoices.");
    await wait(first.id, ["awaiting_confirmation"]);
    await workflow.confirm(first.id);
    assert.equal((await wait(first.id, ["completed", "failed"])).status, "completed");
    const second = await workflow.create("Build a cafe menu and table reservation website.");
    await wait(second.id, ["awaiting_confirmation"]);
    await t.test("a project cannot restore another project's version", async () => {
      const version = workflow.workspace.get(first.projectId).currentVersion!;
      await assert.rejects(workflow.workspace.restore(second.projectId, version.id), /not found/);
    });
    await t.test("export validation rejects syntactically invalid Python", async () => {
      await store.mutate((db) => {
        const version = db.projects[first.projectId].currentVersionId!;
        const file = db.versionFiles[version].find((candidate) => candidate.path === "backend/app/main.py")!;
        file.content += "\ndef invalid(:\n";
        file.digest = digest(file.content);
      });
      const result = await workflow.workspace.validateExport(first.projectId);
      assert.equal(result.validation, "failed");
    });
    await t.test("restart detects an interrupted generating build", async () => {
      await store.mutate((db) => { db.builds[second.id].status = "generating"; });
      const reopened = new JsonStore(directory);
      await reopened.initialize();
      const recovered = new BuildWorkflow(reopened, 0).get(second.id);
      assert.notEqual(recovered.status, "generating", "Stale generation must become resumable or explicitly failed, not hang forever");
      assert.equal(recovered.error?.code, "BUILD_INTERRUPTED");
      assert.equal(reopened.read().builds[first.id].status, "completed");
      const again = new JsonStore(directory);
      await again.initialize();
      assert.deepEqual(again.read(), reopened.read(), "Recovery must persist and be idempotent");
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
