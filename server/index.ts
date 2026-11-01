import { resolve } from "node:path";
import { createForgeWebServer } from "./app.ts";
import { JsonStore } from "./store.ts";
import { BuildWorkflow } from "./workflow.ts";
import { createGenerationProviderFromEnv } from "./providers/generation-provider.ts";
import { createStitchDesignerFromEnv } from "./providers/stitch-design.ts";
import {loadEnvFile} from 'node:process';
import {ProjectRuntime} from './project-runtime.ts';
try{loadEnvFile(resolve('.env.local'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}

const port = Number.parseInt(process.env.FORGEWEB_API_PORT ?? "8787", 10);
const dataDirectory = resolve(process.env.FORGEWEB_DATA_DIR ?? ".forgeweb-data");
const store = new JsonStore(dataDirectory);
await store.initialize();
const provider = createGenerationProviderFromEnv();
const workflow = new BuildWorkflow(store, 180, provider, createStitchDesignerFromEnv());
const runtime=new ProjectRuntime(workflow.workspace,dataDirectory);
const server = createForgeWebServer(workflow,undefined,runtime);

server.listen(port, "127.0.0.1", () => {
  console.log(`ForgeWeb control plane listening on http://127.0.0.1:${port}`);
  console.log(`Persistent data: ${dataDirectory}`);
  console.log(provider ? `Generation provider: ${provider.id} (${provider.model})` : "Generation provider: deterministic local fallback");
});

const shutdown = () => server.close(()=>{void runtime.shutdown().then(()=>process.exit(0),()=>{console.error('Runtime cleanup incomplete. Inspect Docker containers before restarting.');process.exit(1);});});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
