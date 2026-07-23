import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { windowsPowerShellExecutable } from "./platform-shell-runner.js";
import { useTempDirs } from "./platform-shell-fixture.test-utils.js";

const makeTempDir = useTempDirs("platform-shell-runner-windows-test-", { cleanupAfterAll: true });

describe("windows powershell resolution", () => {
  const POWERSHELL_ENV_KEYS = [
    "PATH", "Path", "ProgramW6432", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA",
  ] as const;

  function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
    const saved = new Map(POWERSHELL_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of POWERSHELL_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[key] = value;
    }
    try {
      run();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("falls back to the known install location when pwsh is missing from PATH", () => {
    const root = makeTempDir();
    const installed = path.join(root, "PowerShell", "7", "pwsh.exe");
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.writeFileSync(installed, "");
    withEnv({ PATH: makeTempDir(), ProgramFiles: root }, () => {
      expect(windowsPowerShellExecutable()).toBe(installed);
    });
  });

  it("returns the bare name when pwsh is absent everywhere", () => {
    withEnv({ PATH: makeTempDir() }, () => {
      expect(windowsPowerShellExecutable()).toBe("pwsh");
    });
  });
});

describe("detached console handling", () => {
  it("hides the console window it spawns", () => {
    const runner = fs.readFileSync(path.resolve(__dirname, "platform-shell-runner.ts"), "utf-8");
    expect(runner).toContain("windowsHide: true");
  });
});
