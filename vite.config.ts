import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createForgeWebRequestHandler, type ForgeWebRequestHandler } from "./server/app.ts";
import { JsonStore } from "./server/store.ts";
import { BuildWorkflow } from "./server/workflow.ts";
import { createGenerationProviderFromEnv } from "./server/providers/generation-provider.ts";
import { createStitchDesignerFromEnv } from "./server/providers/stitch-design.ts";
import { McpConnections } from './server/mcp-connections.ts';
import {ProjectRuntime} from './server/project-runtime.ts';

function forgeWebDevApi(environment: Record<string, string>): Plugin {
  let handler: Promise<ForgeWebRequestHandler> | undefined;
  let projectRuntime:ProjectRuntime|undefined;
  return {
    name: "forgeweb-dev-api",
    async closeBundle(){await projectRuntime?.shutdown();},
    configureServer(server) {
      handler ??= (async () => {
        const store = new JsonStore(resolve(process.cwd(), environment.FORGEWEB_DATA_DIR ?? ".forgeweb-data"));
        await store.initialize();
        const workflow=new BuildWorkflow(store,180,createGenerationProviderFromEnv(environment),createStitchDesignerFromEnv(environment));
        projectRuntime=new ProjectRuntime(workflow.workspace,resolve(environment.FORGEWEB_DATA_DIR??'.forgeweb-data'),environment);
        return createForgeWebRequestHandler(workflow,new McpConnections(environment),projectRuntime);
      })();
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api")) {
          next();
          return;
        }
        void handler!.then((api) => api(request, response)).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve:{alias:[{find:/^three$/,replacement:resolve('node_modules/three/src/Three.js')}]},
  // Generated HTML, graph extraction and runtime files are data, not ForgeWeb UI source.
  // Watching these files caused whole-page reloads during indexing/validation.
  server:{watch:{ignored:['**/.forgeweb-data/**']}},
  plugins: [forgeWebDevApi(loadEnv(mode, process.cwd(), "")), react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              priority: 3,
              includeDependenciesRecursively: false,
            },
            {
              name: "motion-vendor",
              test: /node_modules[\\/](animejs|gsap|motion)[\\/]/,
              priority: 2,
              includeDependenciesRecursively: false,
            },
            {
              name: "three-vendor",
              test: /node_modules[\\/]three[\\/]/,
              priority: 2,
              includeDependenciesRecursively: false,
            },
            {
              name: "icons-vendor",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 1,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
}));
