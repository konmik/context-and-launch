import { describe, it, expect, afterEach } from "vitest";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT_PATH = path.resolve(
  __dirname, "../../../config-defaults/find-locking-processes.ps1",
);

function runFinder(dir: string): Array<{ pid: number; processName: string }> {
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH, dir],
    { encoding: "utf-8", timeout: 30000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.split("\n")
    .map(line => line.trim().split("\t"))
    .filter(parts => parts.length >= 2)
    .map(parts => ({ pid: Number(parts[0]), processName: parts[1] }));
}

describe.runIf(process.platform === "win32")("find-locking-processes.ps1", () => {
  const holders: number[] = [];
  const dirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "locking-processes-")),
    );
    dirs.push(dir);
    return dir;
  }

  async function holdOpenFile(filePath: string): Promise<number> {
    const child = spawn("powershell", [
      "-NoProfile", "-Command",
      `$f = [System.IO.File]::Open('${filePath}', 'Open', 'Read', 'None');`
      + ` Write-Output ready; Start-Sleep 60`,
    ], { cwd: os.homedir(), stdio: ["ignore", "pipe", "ignore"] });
    holders.push(child.pid!);
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", () => resolve());
      child.on("exit", () => reject(new Error("holder exited early")));
    });
    return child.pid!;
  }

  afterEach(() => {
    while (holders.length > 0) {
      try { process.kill(holders.pop()!); } catch { /* already exited */ }
    }
    while (dirs.length > 0) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("reports a process holding an open file handle from another directory", async () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "held.txt");
    fs.writeFileSync(filePath, "held");
    const holderPid = await holdOpenFile(filePath);

    expect(runFinder(dir).map(p => p.pid)).toContain(holderPid);
  }, 60000);

  it("reports nothing for a directory no process is using", () => {
    expect(runFinder(makeTempDir())).toEqual([]);
  }, 30000);
});
