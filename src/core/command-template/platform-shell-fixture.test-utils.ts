import { afterAll, afterEach } from "vitest";
import { spawn } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

export function useTempDirs(
  prefix: string,
  options: { cleanupAfterAll?: boolean } = {},
): () => string {
  const tempDirs: string[] = [];
  const cleanupAll = async () => {
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
  };
  if (options.cleanupAfterAll) afterAll(cleanupAll);
  else afterEach(cleanupAll);
  return () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };
}

export async function runSurvivalFixture(fixtureArgs: string[]): Promise<string> {
  const repoRoot = path.resolve(__dirname, "../../..");
  const fixturePath = path.join(__dirname, "platform-shell-runner.survival-fixture.ts");
  const tsxCliPath = createRequire(import.meta.url).resolve("tsx/cli");
  const parent = spawn(process.execPath, [tsxCliPath, fixturePath, ...fixtureArgs], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  let parentStderr = "";
  parent.stderr.on("data", (chunk: Buffer) => { parentStderr += chunk.toString(); });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    parent.on("error", reject);
    parent.on("exit", (code) => resolve(code));
  });
  if (exitCode !== 0) {
    throw new Error(`fixture parent failed (exit ${exitCode}), stderr: ${parentStderr}`);
  }
  return parentStderr;
}

export async function waitForFile(filePath: string, failMessage: () => string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(filePath)) {
    if (Date.now() > deadline) throw new Error(failMessage());
    await new Promise(r => setTimeout(r, 50));
  }
}

export function killIfAlive(pid: number): void {
  try {
    process.kill(pid);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
  }
}
