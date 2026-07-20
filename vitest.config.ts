import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const alias = { "~": path.resolve(__dirname, "src") };
const plugins = [solidPlugin()] as any[];
const solidVite = { plugins, resolve: { alias, conditions: ["browser", "development"] } };

export default defineConfig({
  ...solidVite,
  test: {
    projects: [
      { ...solidVite, test: { name: "unit-ts", include: ["src/**/*.test.ts", "electron/**/*.test.ts"], exclude: ["**/*.shell.test.ts"], testTimeout: 20000 } },
      { ...solidVite, test: { name: "unit-tsx", include: ["src/**/*.test.tsx"], environment: "jsdom", setupFiles: ["src/test-setup.ts"] } },
      {
        resolve: { alias },
        test: {
          name: "e2e",
          include: ["e2e/**/*.test.ts"],
          testTimeout: 60000,
          hookTimeout: 60000,
          maxConcurrency: 1,
          maxWorkers: 1,
          minWorkers: 1,
          fileParallelism: false,
        },
      },
    ],
  },
});
