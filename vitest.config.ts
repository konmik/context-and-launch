import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
    conditions: ["browser", "development"],
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.ts"],
    environmentMatchGlobs: [
      ["src/**/*.test.tsx", "jsdom"],
    ],
  },
});
