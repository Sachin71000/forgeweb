import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonStore } from "../store.ts";

test("failed persistence never publishes uncommitted state and later writes recover", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-store-test-"));
  const store = new JsonStore(directory);
  try {
    await store.initialize();
    await mkdir(`${store.filePath}.tmp`);
    await assert.rejects(store.mutate((db) => { db.events.failed = []; }));
    assert.equal(store.read().events.failed, undefined);
    await rm(`${store.filePath}.tmp`, { recursive: true });
    await store.mutate((db) => { db.events.saved = []; });
    const reopened = new JsonStore(directory);
    await reopened.initialize();
    assert.deepEqual(reopened.read().events, { saved: [] });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
