import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ForgeDatabase } from "./domain.ts";
import { id, now } from "./lib.ts";

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

export class JsonStore {
  private database: ForgeDatabase | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  readonly filePath: string;

  constructor(dataDirectory: string) {
    this.filePath = join(dataDirectory, "forgeweb.json");
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as ForgeDatabase;
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
      if (schemaVersion === 1 || recovered) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.database = emptyDatabase();
      await this.persist();
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
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }
}
