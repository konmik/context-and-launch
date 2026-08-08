import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const timingReporter = fileURLToPath(new URL("./scripts/test-timing-reporter.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: { "~": path.resolve(__dirname, "src") } },
  test: {
    name: "shell",
    include: ["src/**/*.shell.test.ts"],
    testTimeout: 30000,
    reporters: ["default", timingReporter],
  },
});
