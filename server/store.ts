import { mkdir, readFile, rename, copyFile } from "node:fs/promises";
import {constants} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import { dirname, join } from "node:path";
import type { ForgeDatabase } from "./domain.ts";
import { id, now, ApiError } from "./lib.ts";

const emptyDatabase = (): ForgeDatabase => ({
  schemaVersion: 2,
  projects: {},
  specifications: {},
  builds: {},
  tasks: {},
  files: {},
  events: {},
  graphs: {},
  versions: {},
  versionFiles: {},
});

// Antivirus/sync readers can briefly lock the destination on Windows. Keep the
// old file intact and retry the atomic rename only; never delete it first.
export async function renameWithRetry(source:string,target:string,operation=rename,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<void>{
  for(let attempt=0;attempt<5;attempt++){
    try{await operation(source,target);return;}
    catch(error){
      if(!['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code??'')||attempt===4)throw error;
      await wait(50*2**attempt);
    }
  }
}

export class JsonStore {
  private database: ForgeDatabase | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  readonly filePath: string;
  private connection?: DatabaseSync;
  private revision = 0;

  constructor(dataDirectory: string) {
    this.filePath = join(dataDirectory, "forgeweb.sqlite3");
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.connection = new DatabaseSync(this.filePath);
    this.connection.exec("PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state_meta(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL); INSERT OR IGNORE INTO state_meta VALUES(1,0);");
    for(const table of Object.keys(emptyDatabase()).filter(key=>key!=='schemaVersion'))this.connection.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)))`);
    const revision=this.connection.prepare('SELECT revision FROM state_meta WHERE id=1').get() as {revision:number};
    this.revision=revision.revision;
    try {
      let parsed:ForgeDatabase;
      if(this.revision>0){
        parsed=emptyDatabase();
        for(const table of Object.keys(parsed).filter(key=>key!=='schemaVersion')){
          const rows=this.connection.prepare(`SELECT id,payload FROM "${table}"`).all() as Array<{id:string;payload:string}>;
          (parsed as unknown as Record<string,unknown>)[table]=Object.fromEntries(rows.map(row=>[row.id,JSON.parse(row.payload)]));
        }
      }else{
        const legacy=join(dirname(this.filePath),'forgeweb.json');
        parsed=JSON.parse(await readFile(legacy,'utf8')) as ForgeDatabase;
        try{await copyFile(legacy,`${legacy}.pre-sqlite-backup`,constants.COPYFILE_EXCL);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
      }
      const schemaVersion = (parsed as unknown as { schemaVersion: number }).schemaVersion;
      if (![1, 2].includes(schemaVersion)) throw new Error(`Unsupported database schema ${schemaVersion}`);
      this.database = {
        ...parsed,
        schemaVersion: 2,
        versions: parsed.versions ?? {},
        versionFiles: parsed.versionFiles ?? {},
      };
      let recovered = false;
      for (const build of Object.values(this.database.builds)) {
        if (!["queued", "specifying", "planning", "generating", "reviewing", "validating"].includes(build.status)) continue;
        recovered = true;
        const timestamp = now();
        const message = "Build interrupted by a server restart. Start a new build to retry; no provider requests were replayed.";
        build.status = "failed";
        build.error = { code: "BUILD_INTERRUPTED", message };
        build.stageDetail = message;
        build.updatedAt = timestamp;
        const project = this.database.projects[build.projectId];
        if (project?.currentBuildId === build.id) { project.status = "failed"; project.updatedAt = timestamp; }
        for (const taskId of build.taskIds) {
          const task = this.database.tasks[taskId];
          if (task && task.status !== "completed") task.status = "failed";
        }
        (this.database.events[build.id] ??= []).push({ id: id("event"), buildId: build.id, type: "build.failed", message, timestamp, data: { code: "BUILD_INTERRUPTED" } });
      }
      if (this.revision === 0 || schemaVersion === 1 || recovered) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.database = emptyDatabase();
      await this.persist();
    } finally {
      this.close();
    }
  }

  read(): ForgeDatabase {
    if (!this.database) throw new Error("JsonStore must be initialized before use.");
    return structuredClone(this.database);
  }

  async mutate<T>(mutation: (database: ForgeDatabase) => T | Promise<T>): Promise<T> {
    let result!: T;
    let failure: unknown;
    this.writeQueue = this.writeQueue.then(async () => {
      if (!this.database) throw new Error("JsonStore must be initialized before use.");
      const working = structuredClone(this.database);
      try {
        result = await mutation(working);
        await this.persist(working);
        this.database = working;
      } catch (error) {
        failure = error;
      }
    });
    await this.writeQueue;
    if (failure) throw failure;
    return result;
  }

  private async persist(database = this.database): Promise<void> {
    if (!database) return;
    const owned=!this.connection;
    const db=this.connection??new DatabaseSync(this.filePath);
    db.exec('PRAGMA busy_timeout=1000');
    try{
    db.exec('BEGIN IMMEDIATE');
    try{
      const row=db.prepare('SELECT revision FROM state_meta WHERE id=1').get() as {revision:number};
      if(row.revision!==this.revision)throw new ApiError(409,'STORE_CONFLICT','Storage changed in another server process. Restart this server before writing; no data was overwritten.');
      for(const [table,records] of Object.entries(database)){
        if(table==='schemaVersion')continue;
        if(!Object.hasOwn(emptyDatabase(),table))throw new Error('Unknown storage table');
        db.exec(`DELETE FROM "${table}"`);
        const insert=db.prepare(`INSERT INTO "${table}"(id,payload) VALUES(?,?)`);
        for(const [key,value] of Object.entries(records))insert.run(key,JSON.stringify(value));
      }
      db.prepare('UPDATE state_meta SET revision=revision+1 WHERE id=1').run();
      db.exec('COMMIT');
      this.revision++;
    }catch(error){db.exec('ROLLBACK');throw error;}
    }finally{if(owned)db.close();}
  }

  storageInfo(){
    if(!this.database)throw new Error('Storage is not initialized');
    const db=new DatabaseSync(this.filePath,{readOnly:true});
    try{return {engine:'SQLite',location:this.filePath,tables:Object.keys(emptyDatabase()).filter(key=>key!=='schemaVersion').map(name=>({name,count:(db.prepare(`SELECT count(*) AS count FROM "${name}"`).get() as {count:number}).count})),note:'ForgeWeb history and source. Customer application records use a separate per-project SQLite database.'};}finally{db.close();}
  }

  close(){this.connection?.close();this.connection=undefined;}
}
