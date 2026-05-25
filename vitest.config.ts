import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const alias = { "~": path.resolve(__dirname, "src") };
const solidVite = { plugins: [solidPlugin()], resolve: { alias, conditions: ["browser", "development"] } };

export default defineConfig({
  ...solidVite,
  test: {
    projects: [
      { ...solidVite, test: { name: "unit-ts", include: ["src/**/*.test.ts"] } },
      { ...solidVite, test: { name: "unit-tsx", include: ["src/**/*.test.tsx"], environment: "jsdom" } },
      { resolve: { alias }, test: { name: "e2e", include: ["e2e/**/*.test.ts"] } },
    ],
  },
});
