import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spawnDetached } from "./spawn-detached.js";
import { isAlive } from "./process-utils.js";
import { ProcessError } from "../shared/errors.js";
import {
  killIfAlive, runSurvivalFixture, useTempDirs, waitForFile,
} from "./spawn-detached.test-utils.js";

const makeTempDir = useTempDirs("spawn-detached-shell-test-");

describe.runIf(process.platform === "win32")("spawnDetached windows powershell job breakaway", () => {
  it("process started by a non-detached powershell keeps running after the app process exits", async () => {
    const pidFile = path.join(makeTempDir(), "grandchild.pid");
    const parentStderr = await runSurvivalFixture([pidFile, "powershell-grandchild"]);
    await waitForFile(pidFile, () => `pid file never appeared, parent stderr: ${parentStderr}`);
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);

    try {
      await new Promise(r => setTimeout(r, 500));
      expect(isAlive(grandchildPid), "powershell grandchild died after parent exit").toBe(true);
    } finally {
      killIfAlive(grandchildPid);
    }
  }, 30000);
});

describe.runIf(process.platform === "win32")("spawnDetached windows .cmd shims", () => {
  it("launches an explicit .cmd path containing spaces", async () => {
    const cwd = makeTempDir();
    const shimDir = path.join(makeTempDir(), "shim dir");
    fs.mkdirSync(shimDir);
    const shimPath = path.join(shimDir, "tool.cmd");
    fs.writeFileSync(shimPath, "@echo off\r\necho %*> out.txt\r\n");
    await spawnDetached(shimPath, ["C:\\fake path\\proj"], cwd);
    const out = fs.readFileSync(path.join(cwd, "out.txt"), "utf-8");
    expect(out).toContain("fake path");
  });

  it("rejects a multiline arg to a .cmd target instead of silently no-oping", async () => {
    const cwd = makeTempDir();
    const shimPath = path.join(makeTempDir(), "tool.cmd");
    fs.writeFileSync(shimPath, "@echo off\r\necho ran> out.txt\r\n");
    const promise = spawnDetached(shimPath, ["line one\nline two"], cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toThrow(/newline/i);
    expect(fs.existsSync(path.join(cwd, "out.txt"))).toBe(false);
  });

  it("resolves a bare command name to a .cmd on PATH", async () => {
    const cwd = makeTempDir();
    const shimDir = makeTempDir();
    fs.writeFileSync(path.join(shimDir, "fake-code.cmd"), "@echo off\r\necho ran> out.txt\r\n");
    const savedPath = process.env.PATH;
    process.env.PATH = `${shimDir};${savedPath}`;
    try {
      await spawnDetached("fake-code", [], cwd);
    } finally {
      process.env.PATH = savedPath;
    }
    expect(fs.readFileSync(path.join(cwd, "out.txt"), "utf-8").trim()).toBe("ran");
  });
});
