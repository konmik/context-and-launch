import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { runCapturedScript, runDetachedProcess } from "./platform-shell-runner.test-utils.js";
import { shellLiteral } from "./command-template-interpolation.js";
import { currentCommandTemplatePlatform } from "./command-template-types.js";
import { USER_ERROR_EXIT_CODE } from "./platform-shell-runner.js";
import { isAlive } from "../launcher/process-utils.js";
import { AppError, ProcessError } from "../shared/errors.js";
import {
  killIfAlive, runSurvivalFixture, useTempDirs, waitForFile,
} from "./platform-shell-fixture.test-utils.js";

const makeTempDir = useTempDirs("platform-shell-runner-test-", { cleanupAfterAll: true });

const platform = currentCommandTemplatePlatform();

/** PowerShell needs the call operator for a quoted executable path. */
function quoted(executable: string): string {
  const literal = shellLiteral(executable, platform);
  return platform === "windows" ? `& ${literal}` : literal;
}

describe("platform shell runner failure classification", () => {
  // Before the wrapper reserved distinct codes, `pwsh -Command` collapsed every
  // non-zero exit to 1, so these two cases were indistinguishable. Callers such
  // as merge-tree conflict detection and Herdr availability depend on telling
  // them apart, so assert the distinction directly against the real shell.
  it.concurrent("reports a command the shell cannot resolve as command-not-found", async () => {
    const cwd = makeTempDir();
    const promise = runCapturedScript("definitely-not-a-real-executable-xyz", cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "command-not-found" });
  });

  it.concurrent("reports a command that chose its own non-zero exit as exited", async () => {
    const cwd = makeTempDir();
    const script = `${quoted(process.execPath)} -e "process.exit(1)"`;
    const promise = runCapturedScript(script, cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "exited", exitCode: 1 });
  });

  it.concurrent("preserves a command's own exit code rather than collapsing it to 1", async () => {
    const cwd = makeTempDir();
    const script = `${quoted(process.execPath)} -e "process.exit(42)"`;
    await expect(runCapturedScript(script, cwd))
      .rejects.toMatchObject({ kind: "exited", exitCode: 42 });
  });

  // A program supplied through a placeholder renders as a quoted literal. On
  // PowerShell that would be a parse error -- an untrappable exit 1 -- so the
  // runner adds the call operator and the missing program stays classifiable.
  it.concurrent("classifies a quoted missing executable as command-not-found", async () => {
    const cwd = makeTempDir();
    const script = `${shellLiteral("definitely-not-a-real-executable-xyz", platform)} --version`;
    const promise = runCapturedScript(script, cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "command-not-found" });
  });

  it.concurrent("runs a quoted executable path that does exist", async () => {
    const cwd = makeTempDir();
    const script = `${shellLiteral(process.execPath, platform)} -e "process.stdout.write('ok')"`;
    await expect(runCapturedScript(script, cwd)).resolves.toContain("ok");
  });

  it.concurrent("only answers exitedWith for a code the command itself chose", async () => {
    const cwd = makeTempDir();
    const missing = await runCapturedScript("definitely-not-a-real-executable-xyz", cwd)
      .then(() => { throw new Error("expected a failure"); }, (error: unknown) => error as ProcessError);
    const refused = await runCapturedScript(`${quoted(process.execPath)} -e "process.exit(1)"`, cwd)
      .then(() => { throw new Error("expected a failure"); }, (error: unknown) => error as ProcessError);
    expect(refused.exitedWith(1)).toBe(true);
    expect(missing.exitedWith(1)).toBe(false);
  });
});

describe("platform shell runner error/success contract", () => {
  it.concurrent("resolves when the process exits 0 before the detach delay", async () => {
    const cwd = makeTempDir();
    await expect(
      runDetachedProcess(process.execPath, ["-e", "process.exit(0)"], cwd),
    ).resolves.toBeUndefined();
  });

  it.concurrent("rejects with ProcessError when the process exits non-zero", async () => {
    const cwd = makeTempDir();
    const promise = runDetachedProcess(
      process.execPath, ["-e", "console.error('boom'); process.exit(3)"], cwd,
    );
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toThrow(/boom/);
  });

  it.concurrent("rejects with ProcessError when the executable does not exist", async () => {
    const cwd = makeTempDir();
    await expect(
      runDetachedProcess("definitely-not-a-real-executable-xyz", [], cwd),
    ).rejects.toBeInstanceOf(ProcessError);
  });

  it.concurrent(
    "rejects with AppError carrying stderr as the message on the user-error exit code", async () => {
    const cwd = makeTempDir();
    const script = `console.error('Ticket is busy.'); process.exit(${USER_ERROR_EXIT_CODE})`;
    const promise = runDetachedProcess(process.execPath, ["-e", script], cwd);
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toThrow("Ticket is busy.");
  });

  it.concurrent("rejects with ProcessError on the user-error exit code when stderr is empty", async () => {
    const cwd = makeTempDir();
    const promise = runDetachedProcess(
      process.execPath, ["-e", `process.exit(${USER_ERROR_EXIT_CODE})`], cwd,
    );
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
  });
});

describe("platform shell runner stderr temp file cleanup", () => {
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
      await runDetachedProcess(process.execPath, ["-e", script, pidFile], cwd, 300);
      expect(fs.readdirSync(isolatedTmp)).toEqual([]);
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await waitForFile(pidFile, () =>
        `child pid file never appeared under load, cannot clean up child: ${pidFile}`);
      const childPid = Number(fs.readFileSync(pidFile, "utf-8").trim());
      killIfAlive(childPid);
      const deadline = Date.now() + 5000;
      while (isAlive(childPid) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  });
});

describe("platform shell runner parent-exit survival", () => {
  it.concurrent("child keeps running after its parent process exits", async () => {
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

  it.concurrent("child writing to stdout/stderr after parent exit stays alive", async () => {
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

describe("detached console handling", () => {
	it("hides the console window it spawns", () => {
		const runner = fs.readFileSync(path.resolve(__dirname, "platform-shell-runner.ts"), "utf-8");
		expect(runner).toContain("windowsHide: true");
	});
});
