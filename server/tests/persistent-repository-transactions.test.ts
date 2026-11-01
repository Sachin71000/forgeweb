import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistentRepository} from '../generation/persistent-repository.ts';

async function python(directory:string,code:string){
 const runner="import sys,json,os\np=json.load(sys.stdin)\nos.environ['APP_DATABASE_PATH']=p['path']\nexec(p['source'])\nexec(p['test'])";
 return new Promise<string>((resolve,reject)=>{const child=execFile('python',['-I','-S','-c',runner],{timeout:30000,windowsHide:true,maxBuffer:256000},(error,stdout,stderr)=>error?reject(Error(stderr||error.message)):resolve(stdout.trim()));child.stdin!.end(JSON.stringify({path:join(directory,'application.sqlite3'),source:persistentRepository,test:code}));});
}

test('SQLite scaffold keeps legacy CRUD and supports atomic nested transactions, read-only guards and restart persistence',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'repository-transactions-'));
 try{
 const result=await python(directory,`
repository.save({'id':'legacy','title':'saved'})
assert repository.get('legacy')['title']=='saved'
assert repository.delete('missing') is None
repository.save('expenses',{'id':1,'amount':10})
with repository.transaction() as tx:
    assert tx is repository
    value=tx.next_id('expenses')
    assert value>1
    with tx.connect() as first:
        with repository.connect() as second: assert first is second
    tx.save('expenses',{'id':value,'amount':20})
    with tx.transaction() as nested:
        nested.save('audits',{'id':'committed','expense':value})
try:
    with repository.transaction() as tx:
        tx.save('expenses',{'id':'rolled-back','amount':99})
        tx.save('audits',{'id':'rolled-back'})
        raise RuntimeError('force rollback')
except RuntimeError: pass
assert repository.get('rolled-back',collection='expenses') is None
assert repository.get('rolled-back',collection='audits') is None
with repository.transaction() as tx:
    tx.save('expenses',{'id':'outer','amount':30})
    try:
        with tx.transaction() as nested:
            nested.save('expenses',{'id':'inner','amount':40})
            raise RuntimeError('nested rollback')
    except RuntimeError: pass
    assert tx.get('inner',collection='expenses') is None
assert repository.get('outer',collection='expenses')['amount']==30
repository.delete(value,collection='expenses')
assert repository.next_id('expenses')>value
with repository.transaction(write=False) as tx:
    assert tx.list('expenses')
    for operation in [lambda:tx.save({'id':'denied'}),lambda:tx.delete('legacy'),lambda:tx.next_id()]:
        try: operation()
        except ValueError: pass
        else: raise AssertionError('read-only write allowed')
    try:
        with tx.transaction(write=True): pass
    except ValueError: pass
    else: raise AssertionError('read-only escalation allowed')
    try:
        with tx.connect() as db: db.execute('DELETE FROM records')
    except sqlite3.OperationalError: pass
    else: raise AssertionError('raw SQL write allowed')
assert repository.get('legacy')['title']=='saved'
print('passed')
`);
 assert.equal(result,'passed');
 assert.equal(await python(directory,"assert repository.get('legacy')['title']=='saved'\nassert repository.get('outer',collection='expenses')['amount']==30\nassert repository.get('committed',collection='audits') is not None\nprint('persisted')"),'persisted');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('concurrent SQLite transactions allocate unique IDs and preserve all writes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'repository-concurrency-'));
 try{assert.equal(await python(directory,`
from concurrent.futures import ThreadPoolExecutor
def insert(index):
    with repository.transaction() as tx:
        value=tx.next_id('tasks')
        tx.save('tasks',{'id':value,'index':index})
        tx.save('audits',{'id':value,'action':'create'})
        return value
with ThreadPoolExecutor(max_workers=8) as pool: ids=list(pool.map(insert,range(40)))
assert len(set(ids))==40
assert len(repository.list('tasks'))==40
assert len(repository.list('audits'))==40
print('passed')
`),'passed');}finally{await rm(directory,{recursive:true,force:true});}
});
