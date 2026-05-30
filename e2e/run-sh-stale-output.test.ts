import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { pickPort } from "./test-port.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const realScript = path.join(repoRoot, "run.sh");

type Layout = {
  hasOutput: boolean;
  sourceMtimeOffsetMs: number; // mtime of src/file relative to .output/server/index.mjs
};

function makeFakeProject(layout: Layout): { dir: string; scriptPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-sh-stale-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.tsx"), "// fake source\n");
  fs.writeFileSync(path.join(dir, "app.config.ts"), "// fake config\n");
  fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}\n");
  fs.mkdirSync(path.join(dir, "node_modules"));

  if (layout.hasOutput) {
    fs.mkdirSync(path.join(dir, ".output", "server"), { recursive: true });
    const marker = path.join(dir, ".output", "server", "index.mjs");
    fs.writeFileSync(marker, "// fake built entry\n");
    const baseSec = Math.floor(Date.now() / 1000);
    const markerTime = new Date(baseSec * 1000);
    fs.utimesSync(marker, markerTime, markerTime);
    const sourceTime = new Date((baseSec + Math.round(layout.sourceMtimeOffsetMs / 1000)) * 1000);
    for (const rel of ["src/app.tsx", "app.config.ts", "package.json", "package-lock.json"]) {
      fs.utimesSync(path.join(dir, rel), sourceTime, sourceTime);
    }
    // src/ directory mtime can be incidentally bumped by file writes; pin it too.
    fs.utimesSync(path.join(dir, "src"), sourceTime, sourceTime);
  }

  const scriptPath = path.join(dir, "run.sh");
  fs.copyFileSync(realScript, scriptPath);
  fs.chmodSync(scriptPath, 0o755);
  return { dir, scriptPath };
}

function runDry(dir: string, scriptPath: string) {
  // Use a random port that no real server is listening on so the script enters the build gate.
  const port = pickPort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "run-sh-home-"));
  const cfgDir = path.join(home, ".context-launch");
  fs.mkdirSync(cfgDir);
  fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ port }));
  return spawnSync("/bin/bash", [scriptPath], {
    cwd: dir,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      RUN_SH_DRY_RUN: "1",
    },
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe.runIf(process.platform !== "win32")("run.sh build-skip when .output is stale", () => {
  it("rebuilds when a source file is newer than .output/server/index.mjs", () => {
    const { dir, scriptPath } = makeFakeProject({
      hasOutput: true,
      sourceMtimeOffsetMs: 120_000, // sources are 2 minutes newer than the marker
    });
    const result = runDry(dir, scriptPath);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/BUILD=yes REASON=stale/);
    expect(result.stdout).toMatch(/Source files are newer than \.output, rebuilding/);
  });

  it("skips build when .output is fresh", () => {
    const { dir, scriptPath } = makeFakeProject({
      hasOutput: true,
      sourceMtimeOffsetMs: -120_000, // sources are 2 minutes older than the marker
    });
    const result = runDry(dir, scriptPath);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/BUILD=no/);
    expect(result.stdout).not.toMatch(/REASON=stale/);
  });

  it("builds when .output is missing entirely", () => {
    const { dir, scriptPath } = makeFakeProject({
      hasOutput: false,
      sourceMtimeOffsetMs: 0,
    });
    const result = runDry(dir, scriptPath);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/BUILD=yes REASON=missing/);
  });
});
