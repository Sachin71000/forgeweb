import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import {DatabaseSync} from 'node:sqlite';
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonStore, renameWithRetry } from "../store.ts";

test('atomic rename retries transient Windows locks but stops on persistent or unrelated errors',async()=>{
  let calls=0;
  const waits:number[]=[];
  await renameWithRetry('qa.tmp','qa.json',async()=>{if(++calls<3)throw Object.assign(new Error('locked'),{code:'EPERM'});},async ms=>{waits.push(ms)});
  assert.equal(calls,3);
  assert.deepEqual(waits,[50,100]);
  calls=0;
  await assert.rejects(renameWithRetry('qa.tmp','qa.json',async()=>{calls++;throw Object.assign(new Error('locked'),{code:'EBUSY'})},async()=>{}),/locked/);
  assert.equal(calls,5);
  calls=0;
  await assert.rejects(renameWithRetry('qa.tmp','qa.json',async()=>{calls++;throw Object.assign(new Error('disk full'),{code:'ENOSPC'})},async()=>{}),/disk full/);
  assert.equal(calls,1);
});

test("failed persistence never publishes uncommitted state and later writes recover", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forgeweb-store-test-"));
  const store = new JsonStore(directory);
  try {
    await store.initialize();
    const lock=new DatabaseSync(store.filePath);lock.exec('BEGIN IMMEDIATE');
    await assert.rejects(store.mutate((db) => { db.events.failed = []; }));
    assert.equal(store.read().events.failed, undefined);
    lock.exec('ROLLBACK');lock.close();
    await store.mutate((db) => { db.events.saved = []; });
    const reopened = new JsonStore(directory);
    await reopened.initialize();
    assert.deepEqual(reopened.read().events, { saved: [] });
    reopened.close();
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('SQLite migration preserves legacy JSON and prevents stale writers overwriting data',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'forgeweb-migration-'));
 const first=new JsonStore(directory);const second=new JsonStore(directory);
 try{
  const legacy=JSON.stringify({schemaVersion:2,projects:{},specifications:{},builds:{},tasks:{},files:{},events:{retained:[]},graphs:{},versions:{},versionFiles:{}});
  await writeFile(join(directory,'forgeweb.json'),legacy);
  await first.initialize();await second.initialize();
  assert.equal(await readFile(join(directory,'forgeweb.json.pre-sqlite-backup'),'utf8'),legacy);
  assert.deepEqual(first.read().events.retained,[]);
  await first.mutate(db=>{db.events.new=[];});
  await assert.rejects(second.mutate(db=>{db.events.stale=[];}),/another server process/);
  assert.equal(second.read().events.stale,undefined);
  assert.equal(first.storageInfo().engine,'SQLite');
 }finally{first.close();second.close();await rm(directory,{recursive:true,force:true});}
});
