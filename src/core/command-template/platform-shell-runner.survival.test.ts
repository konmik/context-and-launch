import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isAlive } from "../launcher/process-utils.js";
import {
  killIfAlive, runSurvivalFixture, useTempDirs, waitForFile,
} from "./platform-shell-fixture.test-utils.js";

const makeTempDir = useTempDirs("platform-shell-runner-survival-test-", { cleanupAfterAll: true });

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
