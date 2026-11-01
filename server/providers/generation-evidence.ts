import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { digest, id } from "../lib.ts";

export type EvidenceEvent = Record<string, unknown> & { event: string };

export class GenerationEvidence {
  private readonly secrets: string[];
  constructor(privateDirectory: string, secrets: string[] = []) {
    this.directory = privateDirectory;
    this.secrets = secrets.filter((secret) => secret.length > 5);
  }
  readonly directory: string;
  private redact(text: string): string {
    for (const secret of this.secrets) text = text.split(secret).join('[redacted]');
    return text.replace(/(?:gsk_|sk-or-v1-|AIza)[A-Za-z0-9_-]{12,}/g, '[redacted]')
      .replace(/([?&](?:key|api_key|token|access_token|signature|x-goog-signature)=)[^&\s"\\]+/gi, '$1[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]');
  }
  async record(event: EvidenceEvent): Promise<void> {
    await mkdir(join(this.directory, 'generation-diagnostics'), { recursive: true });
    const report = this.redact(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
    await writeFile(join(this.directory, 'generation-diagnostics', `${id('evidence')}.json`), report, { flag: 'wx', mode: 0o600 });
  }
  async cachedFile(key: string): Promise<{ path: string; content: string; requirementIds: string[] } | undefined> {
    try {
      const raw = JSON.parse(await readFile(join(this.directory, 'generation-cache', `${digest(key).slice(7)}.json`), 'utf8'));
      if (raw.version !== 1 || typeof raw.file?.path !== 'string' || typeof raw.file?.content !== 'string' || !Array.isArray(raw.file?.requirementIds) || !raw.file.requirementIds.every((item: unknown) => typeof item === 'string') || raw.digest !== digest(JSON.stringify(raw.file))) return undefined;
      return raw.file;
    } catch { return undefined; }
  }
  async cacheFile(key: string, file: { path: string; content: string; requirementIds: string[] }): Promise<void> {
    // Never cache source containing a configured secret; redacting would change code.
    if (this.redact(JSON.stringify(file)) !== JSON.stringify(file)) return;
    await mkdir(join(this.directory, 'generation-cache'), { recursive: true });
    await writeFile(join(this.directory, 'generation-cache', `${digest(key).slice(7)}.json`), JSON.stringify({ version: 1, file, digest: digest(JSON.stringify(file)) }), { mode: 0o600 });
  }

  async cachedManifest(key: string): Promise<Array<{path:string;content:string;requirementIds:string[]}> | undefined> {
    try {
      const raw=JSON.parse(await readFile(join(this.directory,'generation-cache',`${digest(key).slice(7)}.json`),'utf8'));
      if(raw.version!==1 || !Array.isArray(raw.files) || raw.files.length>40 || raw.digest!==digest(JSON.stringify(raw.files))) return undefined;
      if(!raw.files.every((file: {path?:unknown;content?:unknown;requirementIds?:unknown}) => typeof file.path==='string' && typeof file.content==='string' && Array.isArray(file.requirementIds) && file.requirementIds.every((item:unknown)=>typeof item==='string')))return undefined;
      if(this.redact(JSON.stringify(raw.files))!==JSON.stringify(raw.files))return undefined;
      return raw.files;
    }catch{return undefined;}
  }

  async cacheManifest(key:string, files:Array<{path:string;content:string;requirementIds:string[]}>):Promise<void>{
    if(this.redact(JSON.stringify(files))!==JSON.stringify(files))return;
    await mkdir(join(this.directory,'generation-cache'),{recursive:true});
    await writeFile(join(this.directory,'generation-cache',`${digest(key).slice(7)}.json`),JSON.stringify({version:1,files,digest:digest(JSON.stringify(files))}),{mode:0o600});
  }
}
