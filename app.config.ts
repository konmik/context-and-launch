import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LANGUAGE_DATA_STUB = "\0codemirror-language-data-server-stub";

function stubLanguageDataOnServer() {
  return {
    name: "stub-codemirror-language-data-on-server",
    enforce: "pre" as const,
    resolveId(id: string, _importer: string | undefined, options?: { ssr?: boolean }) {
      if (options?.ssr && id === "@codemirror/language-data") return LANGUAGE_DATA_STUB;
      return null;
    },
    load(id: string) {
      if (id === LANGUAGE_DATA_STUB) return "export const languages = [];";
      return null;
    },
  };
}

export default defineConfig({
  ssr: false,
  middleware: "./src/middleware.ts",
  vite: {
    build: { target: "esnext" },
    optimizeDeps: {
      esbuildOptions: { target: "esnext" },
      // Dep discovery after dev-server startup triggers "new dependencies
      // optimized: reloading", a full-page reload. noDiscovery turns discovery
      // off entirely, so every lazily-imported CJS dep must be pinned in
      // include; the entries below are @solidjs/start's lazy dev-mode deps.
      // A newly added client dependency that misbehaves in dev likely needs an
      // entry here too.
      noDiscovery: true,
      include: [
        "@solidjs/start > source-map-js",
        "@solidjs/start > error-stack-parser",
      ],
    },
    plugins: [stubLanguageDataOnServer(), tailwindcss()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "src")
      }
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}"]
    }
  },
  server: {
    preset: "node-server",
  }
});
