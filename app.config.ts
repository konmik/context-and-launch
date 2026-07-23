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
    server: {
      watch: {
        ignored: ["**/dist-electron/**"],
      },
    },
    optimizeDeps: {
      esbuildOptions: { target: "esnext" },
      // Deps discovered after dev-server startup trigger "new dependencies
      // optimized: reloading", a full-page reload. The entries below are
      // lazily-imported deps (via @solidjs/start dev mode and the clientOnly
      // MarkdownEditor), pinned so they are pre-bundled at startup instead of
      // discovered late. If dev logs that message for another dep, add it
      // here too.
      include: [
        "@solidjs/start > source-map-js",
        "@solidjs/start > error-stack-parser",
        "@codemirror/view",
        "@codemirror/state",
        "@codemirror/lang-markdown",
        "@codemirror/language-data",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/autocomplete",
        "@codemirror/search",
        "@lezer/highlight",
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
