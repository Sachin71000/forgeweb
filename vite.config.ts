import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createForgeWebRequestHandler, type ForgeWebRequestHandler } from "./server/app.ts";
import { JsonStore } from "./server/store.ts";
import { BuildWorkflow } from "./server/workflow.ts";
import { createGenerationProviderFromEnv } from "./server/providers/generation-provider.ts";

function forgeWebDevApi(environment: Record<string, string>): Plugin {
  let handler: Promise<ForgeWebRequestHandler> | undefined;
  return {
    name: "forgeweb-dev-api",
    configureServer(server) {
      handler ??= (async () => {
        const store = new JsonStore(resolve(process.cwd(), ".forgeweb-data"));
        await store.initialize();
        return createForgeWebRequestHandler(new BuildWorkflow(store, 180, createGenerationProviderFromEnv(environment)));
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
