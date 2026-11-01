import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { importStitchZip, MAX_STITCH_ZIP } from "../providers/stitch-zip.ts";
import { createProjectZip } from "../zip.ts";
import { JsonStore } from "../store.ts";
import { BuildWorkflow } from "../workflow.ts";
import { createForgeWebServer } from "../app.ts";

const archive = (files: Array<[string, string]>) => createProjectZip(files.map(([path, content]) => ({ path, content, digest: "test", requirementIds: [] })));
const html = '<html><head><link rel="stylesheet" href="style.css"></head><body><h1>Portfolio</h1><script>doNotExecute()</script></body></html>';

test("ZIP design reads HTML/CSS without executing scripts and requires no Stitch API", async () => {
  const design = await importStitchZip(archive([["site/index.html", html], ["site/style.css", "body{background:ivory}"]]));
  assert.equal(design.source, "zip");
  assert.equal(design.pageCount, 1);
  assert.match(design.html, /background:ivory/);
  assert.match(design.html, /Portfolio/);
  assert.doesNotMatch(design.html, /doNotExecute/);
});

test("ZIP importer rejects corrupt, missing CSS/HTML and duplicate entries", async () => {
  for (const buffer of [Buffer.from("not a zip"), Buffer.alloc(0), archive([["picture.png", "image"]]), archive([["index.html", html]]), archive([["index.html", '<html><body>x</body></html>'], ["index.html", '<html><body>x</body></html>']])]) {
    await assert.rejects(importStitchZip(buffer));
  }
});

test("ZIP importer rejects traversal, secrets, symlinks, too many entries and excessive size", async () => {
  const valid = archive([["xx/index.html", '<html><body>x</body></html>']]);
  const traversal = Buffer.from(valid);
  for (let index = traversal.indexOf('xx/index.html'); index !== -1; index = traversal.indexOf('xx/index.html', index + 1)) traversal.write('../index.html', index);
  const symlink = Buffer.from(valid);
  const central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  symlink.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
  const bomb = Buffer.from(valid);
  bomb.writeUInt32LE(17 * 1024 * 1024, central + 24);
  for (const buffer of [traversal, symlink, bomb, archive([[".env", "secret"]]), archive(Array.from({length: 201}, (_, index) => [`${index}.txt`, 'data'] as [string,string])), Buffer.alloc(MAX_STITCH_ZIP + 1)]) await assert.rejects(importStitchZip(buffer));
});

test("ZIP HTTP import preserves approval, blocks cross-origin requests and bypasses Stitch after confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-stitch-zip-"));
  const store = new JsonStore(directory);
  await store.initialize();
  let stitchCalls = 0;
  const workflow = new BuildWorkflow(store, 0, undefined, { async design() { stitchCalls++; throw new Error('Must not call Stitch for an imported design'); } });
  const server = createForgeWebServer(workflow);
  await new Promise<void>((resolve) => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const wait = async (id: string, status: string) => {
    for(let i=0;i<2000;i++) {
      const build = workflow.get(id);
      if(build.status === status) return build;
      if(build.status === 'failed') throw new Error(build.stageDetail);
      await new Promise((resolve) => setTimeout(resolve,5));
    }
    throw new Error('Timed out');
  };
  try {
    const created = await workflow.create('Build a portfolio for an AI developer with projects and contact.');
    await wait(created.id,'awaiting_confirmation');
    const url = `${base}/api/builds/${created.id}/stitch-zip`;
    const zip = archive([["index.html", '<html><body>Portfolio design</body></html>']]);
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/zip',origin:'https://evil.example'},body:zip})).status,403);
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},body:zip})).status,415);
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/zip'},body:'bad'})).status,400);
    const response = await fetch(url,{method:'POST',headers:{'content-type':'application/zip'},body:zip});
    assert.equal(response.status,200);
    const imported = workflow.get(created.id);
    assert.equal(imported.status,'awaiting_confirmation');
    assert.equal(imported.specification?.status,'proposed');
    assert.equal(imported.specification?.stitchDesign?.source,'zip');
    assert.equal(imported.filePaths.length,0);
    await workflow.confirm(created.id);
    await wait(created.id,'completed');
    assert.equal(stitchCalls,0);
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/zip'},body:zip})).status,409);
  } finally {
    await new Promise<void>((resolve) => server.close(()=>resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});
