import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectRuntime,redactStorage} from '../project-runtime.ts';
import type {ProjectWorkspaceService} from '../project-workspace.ts';

const workspace={get(){return {currentVersion:{id:'version-1'}};}} as unknown as ProjectWorkspaceService;
test('storage viewer masks credentials recursively and bounds long values',()=>{
 assert.deepEqual(redactStorage({name:'Demo',password:'private',nested:{apiKey:'private',token:'private'},note:'gsk_abc123'}),{name:'Demo',password:'[redacted]',nested:{apiKey:'[redacted]',token:'[redacted]'},note:'[redacted]'});
 assert.equal((redactStorage('x'.repeat(5000)) as string).length,2000);
});
test('runtime defaults to stopped and storage rejects invalid paging and injected names before Docker',async()=>{
 const runtime=new ProjectRuntime(workspace,'.forgeweb-data');
 assert.equal((await runtime.status('project')).status,'stopped');
 assert.equal((await runtime.status('project')).url,undefined);
 for(const [collection,offset] of [["x';DROP TABLE records;--",0],['records',-1],['records',NaN],['records',1.5]] as Array<[string,number]>)await assert.rejects(runtime.storage('project',collection,offset),/Invalid collection or page offset/);
});
