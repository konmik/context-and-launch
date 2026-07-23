import { afterAll, afterEach } from "vitest";
import { spawn } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { makeTempDir, removeTempDir } from "~/test-temp.js";

export function useTempDirs(
  prefix: string,
  options: { cleanupAfterAll?: boolean } = {},
): () => string {
  const tempDirs: string[] = [];
  const cleanupAll = async () => {
    while (tempDirs.length > 0) {
      await removeTempDir(tempDirs.pop()!);
    }
  };
  if (options.cleanupAfterAll) afterAll(cleanupAll);
  else afterEach(cleanupAll);
  return () => {
    const dir = makeTempDir(prefix);
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
