import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "~": path.resolve(__dirname, "src") } },
  test: {
    name: "shell",
    include: ["src/**/*.shell.test.ts"],
    testTimeout: 30000,
  },
});
