import { defineConfig } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const LANGUAGE_DATA_STUB = "\0codemirror-language-data-server-stub";

function stubLanguageDataOnServer() {
  return {
    name: "stub-codemirror-language-data-on-server",
    enforce: "pre" as const,
    resolveId(id: string, _importer: string | undefined, options?: { ssr?: boolean }) {
      return options?.ssr && id === "@codemirror/language-data" ? LANGUAGE_DATA_STUB : null;
    },
    load(id: string) {
      return id === LANGUAGE_DATA_STUB ? "export const languages = [];" : null;
    },
  };
}

export default defineConfig({
  plugins: [
    solidPlugin({
      compiler: "babel",
      start: { middleware: "./src/server/middleware.ts", devtools: false },
      serverFunctions: { configure: "./src/server-config.ts" },
    }),
    stubLanguageDataOnServer(),
    tailwindcss(),
  ],
  build: { target: "esnext" },
  ssr: { noExternal: true },
  server: { watch: { ignored: ["**/dist-electron/**"] } },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    include: [
      "@codemirror/view", "@codemirror/state", "@codemirror/lang-markdown",
      "@codemirror/language-data", "@codemirror/commands", "@codemirror/language",
      "@codemirror/autocomplete", "@codemirror/search", "@lezer/highlight",
    ],
  },
  resolve: { alias: { "~": path.resolve(root, "src") } },
});
