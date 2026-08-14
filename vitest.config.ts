import { defineConfig } from "vitest/config";
import solidPlugin from "@solidjs/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const alias = { "~": path.resolve(__dirname, "src") };
const solidVite = () => ({ plugins: solidPlugin(), resolve: { alias } });
const timingReporter = fileURLToPath(new URL("./scripts/test-timing-reporter.ts", import.meta.url));
const projectTemplate = fileURLToPath(new URL("./e2e/project-template.ts", import.meta.url));

export default defineConfig({
  ...solidVite(),
  test: {
    poolOptions: { forks: { maxForks: process.platform === "win32" ? 8 : 24 } },
    reporters: ["default", timingReporter],
    projects: [
      { ...solidVite(), test: { name: "unit-ts", isolate: false, include: ["src/**/*.test.ts", "electron/**/*.test.ts"], exclude: ["src/server/**/*.test.ts", "**/*.shell.test.ts"], testTimeout: 20000, maxConcurrency: 8, setupFiles: ["src/test-git-env.ts"] } },
      { ...solidVite(), test: { name: "unit-tsx", include: ["src/**/*.test.tsx"], environment: "jsdom", setupFiles: ["src/test-setup.ts"] } },
      { ...solidVite(), test: { name: "server", environment: "node", include: ["src/server/**/*.test.ts"], setupFiles: ["src/test-git-env.ts"] } },
      {
        resolve: { alias },
        test: {
          name: "e2e",
          include: ["e2e/**/*.test.ts"],
          testTimeout: 60000,
          hookTimeout: 60000,
          maxConcurrency: 4,
          globalSetup: [projectTemplate],
          setupFiles: ["src/test-git-env.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "bench",
          include: ["e2e/**/*.bench.ts"],
          testTimeout: 600000,
          hookTimeout: 600000,
          maxConcurrency: 1,
          globalSetup: [projectTemplate],
          setupFiles: ["src/test-git-env.ts"],
        },
      },
    ],
  },
});
