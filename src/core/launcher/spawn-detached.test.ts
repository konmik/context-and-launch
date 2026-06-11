import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnDetached } from "./spawn-detached.js";
import { isAlive } from "./process-utils.js";
import { ProcessError } from "../shared/errors.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spawn-detached-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    const deadline = Date.now() + 5000;
    for (;;) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if ((code !== "EBUSY" && code !== "ENOTEMPTY" && code !== "EPERM") ||
            Date.now() > deadline) throw e;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
});

describe("spawnDetached error/success contract", () => {
  it("resolves when the process exits 0 before the detach delay", async () => {
    const cwd = makeTempDir();
    await expect(
      spawnDetached(process.execPath, ["-e", "process.exit(0)"], cwd),
    ).resolves.toBeUndefined();
  });

  it("rejects with ProcessError when the process exits non-zero", async () => {
    const cwd = makeTempDir();
    const promise = spawnDetached(
      process.execPath, ["-e", "console.error('boom'); process.exit(3)"], cwd,
    );
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toThrow(/boom/);
  });

  it("rejects with ProcessError when the executable does not exist", async () => {
    const cwd = makeTempDir();
    await expect(
      spawnDetached("definitely-not-a-real-executable-xyz", [], cwd),
    ).rejects.toBeInstanceOf(ProcessError);
  });
});

describe("spawnDetached stderr temp file cleanup", () => {
  it("removes the stderr temp file once settled via the detach timeout", async () => {
    const cwd = makeTempDir();
    const isolatedTmp = makeTempDir();
    const pidFile = path.join(cwd, "child.pid");
    const script =
      "require('fs').writeFileSync(process.argv[1], String(process.pid));" +
      "console.error('chatty');" +
      "setTimeout(() => {}, 30000);";
    const savedEnv = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
    process.env.TMPDIR = isolatedTmp;
    process.env.TEMP = isolatedTmp;
    process.env.TMP = isolatedTmp;
    try {
      await spawnDetached(process.execPath, ["-e", script, pidFile], cwd, 300);
      expect(fs.readdirSync(isolatedTmp)).toEqual([]);
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      const childPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
      try {
        process.kill(childPid);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
      const deadline = Date.now() + 5000;
      while (isAlive(childPid) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  });
});

describe("spawnDetached parent-exit survival", () => {
  it("child keeps running after its parent process exits", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const fixturePath = path.join(__dirname, "spawn-detached.survival-fixture.ts");
    const tsxCliPath = createRequire(import.meta.url).resolve("tsx/cli");
    const pidFile = path.join(makeTempDir(), "grandchild.pid");

    const parent = spawn(process.execPath, [tsxCliPath, fixturePath, pidFile], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    let parentStderr = "";
    parent.stderr.on("data", (chunk: Buffer) => { parentStderr += chunk.toString(); });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      parent.on("error", reject);
      parent.on("exit", (code) => resolve(code));
    });
    expect(exitCode, `fixture parent failed, stderr: ${parentStderr}`).toBe(0);

    const deadline = Date.now() + 10000;
    while (!fs.existsSync(pidFile)) {
      if (Date.now() > deadline) {
        throw new Error(`pid file never appeared, parent stderr: ${parentStderr}`);
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);

    try {
      await new Promise(r => setTimeout(r, 500));
      expect(isAlive(grandchildPid), "grandchild died after parent exit").toBe(true);
    } finally {
      try {
        process.kill(grandchildPid);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
    }
  }, 30000);

  it("child writing to stdout/stderr after parent exit stays alive", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const fixturePath = path.join(__dirname, "spawn-detached.survival-fixture.ts");
    const tsxCliPath = createRequire(import.meta.url).resolve("tsx/cli");
    const dir = makeTempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    const doneFile = path.join(dir, "grandchild.done");

    const parent = spawn(process.execPath, [tsxCliPath, fixturePath, pidFile, "writing", doneFile], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    let parentStderr = "";
    parent.stderr.on("data", (chunk: Buffer) => { parentStderr += chunk.toString(); });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      parent.on("error", reject);
      parent.on("exit", (code) => resolve(code));
    });
    expect(exitCode, `fixture parent failed, stderr: ${parentStderr}`).toBe(0);

    const pidDeadline = Date.now() + 10000;
    while (!fs.existsSync(pidFile)) {
      if (Date.now() > pidDeadline) {
        throw new Error(`pid file never appeared, parent stderr: ${parentStderr}`);
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());

    try {
      const doneDeadline = Date.now() + 10000;
      while (!fs.existsSync(doneFile)) {
        if (Date.now() > doneDeadline) {
          throw new Error(
            `done file never appeared; grandchild alive: ${isAlive(grandchildPid)} ` +
            "(likely died writing to broken stdout/stderr pipe after parent exit)",
          );
        }
        await new Promise(r => setTimeout(r, 100));
      }
      expect(fs.readFileSync(doneFile, "utf-8")).toBe("done");
    } finally {
      try {
        process.kill(grandchildPid);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
    }
  }, 30000);
});

describe.runIf(process.platform === "win32")("spawnDetached windows powershell job breakaway", () => {
  it("process started by a non-detached powershell keeps running after the app process exits", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const fixturePath = path.join(__dirname, "spawn-detached.survival-fixture.ts");
    const tsxCliPath = createRequire(import.meta.url).resolve("tsx/cli");
    const pidFile = path.join(makeTempDir(), "grandchild.pid");

    const parent = spawn(
      process.execPath, [tsxCliPath, fixturePath, pidFile, "powershell-grandchild"],
      { cwd: repoRoot, stdio: "pipe" },
    );
    let parentStderr = "";
    parent.stderr.on("data", (chunk: Buffer) => { parentStderr += chunk.toString(); });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      parent.on("error", reject);
      parent.on("exit", (code) => resolve(code));
    });
    expect(exitCode, `fixture parent failed, stderr: ${parentStderr}`).toBe(0);

    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);

    try {
      await new Promise(r => setTimeout(r, 500));
      expect(isAlive(grandchildPid), "powershell grandchild died after parent exit").toBe(true);
    } finally {
      try {
        process.kill(grandchildPid);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
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
    await expect(promise).rejects.toThrow(/multiline/i);
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

describe("spawnDetached source guard", () => {
  // PowerShell breaks under DETACHED_PROCESS (nodejs/node#51018), so console
  // hosts stay non-detached; windowsHide gives them a hidden console via
  // CREATE_NO_WINDOW instead of a visible window. Their children still survive
  // app exit because libuv's job object uses JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK
  // (verified by the "powershell job breakaway" test above).
  it("detaches everything except Windows console hosts, which get a hidden console", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "spawn-detached.ts"), "utf-8");
    expect(source).toContain("detached: !ownConsole");
    expect(source).toContain("windowsHide: true");
  });
});
