import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(projectRoot, "dist", "server");
const isolatedRoot = mkdtempSync(path.join(os.tmpdir(), "context-launch-electron-bundle-"));

try {
  if (!existsSync(path.join(serverDir, "server.js"))) {
    throw new Error("Missing dist/server/server.js. Run vite build first.");
  }

  const isolatedServerDir = path.join(isolatedRoot, "dist", "server");
  const isolatedDefaultsDir = path.join(isolatedRoot, "config-defaults");
  mkdirSync(path.dirname(isolatedServerDir), { recursive: true });
  cpSync(serverDir, isolatedServerDir, { recursive: true });
  cpSync(path.join(projectRoot, "config-defaults"), isolatedDefaultsDir, { recursive: true });
  writeFileSync(path.join(isolatedRoot, "package.json"), JSON.stringify({ type: "module" }));

  const serverEntry = pathToFileURL(path.join(isolatedServerDir, "server.js")).href;
  const evaluator = [
    `await import(${JSON.stringify(serverEntry)});`,
    "if (!globalThis.__contextLaunchServices) throw new Error('Server services were not published.');",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", evaluator], {
    cwd: isolatedRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CONTEXT_LAUNCH_CONFIG_DEFAULTS_DIR: isolatedDefaultsDir,
      CONTEXT_LAUNCH_DATA_DIR: path.join(isolatedRoot, "data"),
    },
    timeout: 20_000,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Electron server bundle is not self-contained:\n${result.stderr || result.stdout}`.trim(),
    );
  }

  console.log("Electron server bundle is self-contained.");
} finally {
  rmSync(isolatedRoot, { recursive: true, force: true });
}
