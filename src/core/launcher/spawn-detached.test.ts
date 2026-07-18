import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spawnDetached, USER_ERROR_EXIT_CODE } from "./spawn-detached.js";
import { isAlive } from "./process-utils.js";
import { AppError, ProcessError } from "../shared/errors.js";
import {
  killIfAlive, runSurvivalFixture, useTempDirs, waitForFile,
} from "./spawn-detached.test-utils.js";

const makeTempDir = useTempDirs("spawn-detached-test-");

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

  it("rejects with AppError carrying stderr as the message on the user-error exit code", async () => {
    const cwd = makeTempDir();
    const script = `console.error('Ticket is busy.'); process.exit(${USER_ERROR_EXIT_CODE})`;
    const promise = spawnDetached(process.execPath, ["-e", script], cwd);
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toThrow("Ticket is busy.");
  });

  it("rejects with ProcessError on the user-error exit code when stderr is empty", async () => {
    const cwd = makeTempDir();
    const promise = spawnDetached(
      process.execPath, ["-e", `process.exit(${USER_ERROR_EXIT_CODE})`], cwd,
    );
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
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
      killIfAlive(childPid);
      const deadline = Date.now() + 5000;
      while (isAlive(childPid) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  });
});

describe("spawnDetached parent-exit survival", () => {
  it("child keeps running after its parent process exits", async () => {
    const pidFile = path.join(makeTempDir(), "grandchild.pid");
    const parentStderr = await runSurvivalFixture([pidFile]);
    await waitForFile(pidFile, () => `pid file never appeared, parent stderr: ${parentStderr}`);
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);

    try {
      await new Promise(r => setTimeout(r, 500));
      expect(isAlive(grandchildPid), "grandchild died after parent exit").toBe(true);
    } finally {
      killIfAlive(grandchildPid);
    }
  }, 30000);

  it("child writing to stdout/stderr after parent exit stays alive", async () => {
    const dir = makeTempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    const doneFile = path.join(dir, "grandchild.done");
    const parentStderr = await runSurvivalFixture([pidFile, "writing", doneFile]);
    await waitForFile(pidFile, () => `pid file never appeared, parent stderr: ${parentStderr}`);
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf-8").trim());

    try {
      await waitForFile(doneFile, () =>
        `done file never appeared; grandchild alive: ${isAlive(grandchildPid)} ` +
        "(likely died writing to broken stdout/stderr pipe after parent exit)");
      expect(fs.readFileSync(doneFile, "utf-8")).toBe("done");
    } finally {
      killIfAlive(grandchildPid);
    }
  }, 30000);
});

describe("spawnDetached source guard", () => {
  // PowerShell breaks under DETACHED_PROCESS (nodejs/node#51018), so console
  // hosts stay non-detached; windowsHide gives them a hidden console via
  // CREATE_NO_WINDOW instead of a visible window. Their children still survive
  // app exit because libuv's job object uses JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK
  // (verified by the "powershell job breakaway" test in spawn-detached.shell.test.ts).
  it("detaches everything except Windows console hosts, which get a hidden console", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "spawn-detached.ts"), "utf-8");
    expect(source).toContain("detached: !ownConsole");
    expect(source).toContain("windowsHide: true");
  });
});
