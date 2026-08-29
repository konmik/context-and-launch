import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeMarkerName,
  createActiveMarker,
  getWorkspaceIdentity,
  readActiveMarker,
  tokenEnvironmentName,
  workspaceEnvironmentName,
} from "./test-workspace.mjs";

const workspaceScripts = {
  unit: "test:workspace",
  gate: "test:gate:workspace",
  e2e: "test:e2e:workspace",
  all: "test:all:workspace",
  shell: "test:shell:workspace",
  bench: "bench:workspace",
};
const suite = process.argv[2];
const testArguments = process.argv.slice(3);
if (!Object.hasOwn(workspaceScripts, suite)) {
  console.error(`Usage: node scripts/run-tests.mjs <${Object.keys(workspaceScripts).join("|")}>`);
  process.exit(1);
}

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = path.dirname(scriptsDirectory);

if (process.platform === "win32") {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(scriptsDirectory, "run-tests-on-ramdisk.ps1"),
    "-Suite", suite,
  ], {
    env: {
      ...process.env,
      CONTEXT_LAUNCH_TEST_ARGUMENTS: JSON.stringify(testArguments),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const identity = getWorkspaceIdentity(source);
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `context-launch-tests-${identity.workspaceKey}-`));
const workspace = path.join(runRoot, "workspace");
const runtime = path.join(runRoot, "runtime");
const excluded = new Set([
  ".pi-subagents", ".playwright-mcp", "build", "coverage",
  "dist", "dist-electron", "temp", "test-results",
]);
let marker;

try {
  fs.cpSync(source, workspace, {
    recursive: true,
    filter: (entry) => entry === source || !excluded.has(path.relative(source, entry).split(path.sep)[0]),
  });
  for (const directory of ["temp", "cache", "data", "home"]) {
    fs.mkdirSync(path.join(runtime, directory), { recursive: true });
  }
  marker = createActiveMarker(workspace, identity);
  fs.writeFileSync(path.join(workspace, activeMarkerName), JSON.stringify(marker));
  fs.writeFileSync(path.join(runtime, "home", ".gitconfig"), [
    "[user]", "\tname = Context Launch Tests", "\temail = tests@context-launch.invalid", "",
  ].join("\n"));

  const env = {
    ...process.env,
    TEMP: path.join(runtime, "temp"),
    TMP: path.join(runtime, "temp"),
    TMPDIR: path.join(runtime, "temp"),
    HOME: path.join(runtime, "home"),
    XDG_CACHE_HOME: path.join(runtime, "cache"),
    PNPM_CONFIG_CACHE_DIR: path.join(runtime, "cache", "pnpm"),
    CONTEXT_LAUNCH_DATA_DIR: path.join(runtime, "data"),
    [workspaceEnvironmentName]: workspace,
    [tokenEnvironmentName]: marker.token,
  };
  const result = spawnSync("pnpm", [
    "run", workspaceScripts[suite], ...(testArguments.length ? ["--", ...testArguments] : []),
  ], {
    cwd: workspace,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (marker) {
    const current = readActiveMarker(workspace);
    if (
      current.token !== marker.token
      || current.workspaceKey !== identity.workspaceKey
      || current.sourcePath !== identity.sourcePath
      || current.sourceRef !== identity.sourceRef
    ) {
      throw new Error(`Refusing to remove test workspace with an invalid ownership marker: ${workspace}`);
    }
  }
  fs.rmSync(runRoot, { recursive: true });
}
