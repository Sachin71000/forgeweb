import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ForgeDatabase } from "./domain.ts";

const emptyDatabase = (): ForgeDatabase => ({
  schemaVersion: 1,
  projects: {},
  specifications: {},
  builds: {},
  tasks: {},
  files: {},
  events: {},
  graphs: {},
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
      if (parsed.schemaVersion !== 1) throw new Error(`Unsupported database schema ${parsed.schemaVersion}`);
      this.database = parsed;
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
        this.database = working;
        await this.persist();
      } catch (error) {
        failure = error;
      }
    });
    await this.writeQueue;
    if (failure) throw failure;
    return result;
  }

  private async persist(): Promise<void> {
    if (!this.database) return;
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.database, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }
}
