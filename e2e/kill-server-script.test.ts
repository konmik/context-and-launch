import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { pickPort } from "./test-port.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "kill-server.sh");

function makeHomeWithPort(port: number, prefix: string): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const cfgDir = path.join(home, ".context-launch");
  fs.mkdirSync(cfgDir);
  fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ port }));
  return home;
}

function runScript(env: NodeJS.ProcessEnv) {
  return spawnSync("/bin/bash", [scriptPath], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe.runIf(process.platform !== "win32")(
  "kill-server.sh on hosts missing port-inspection tools",
  () => {
    it("exits 0 with a warning when lsof, fuser, and ss are all unavailable", () => {
      const home = makeHomeWithPort(pickPort(), "kill-server-noop-");
      const result = runScript({
        PATH: "/var/empty-does-not-exist",
        HOME: home,
      });
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
      expect(result.stdout).toMatch(/No process listening/);
    });

    it("exits 0 when lsof is present and the server is not running on the configured port", () => {
      const home = makeHomeWithPort(pickPort(), "kill-server-idle-");
      const result = runScript({
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: home,
      });
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
      expect(result.stdout).toMatch(/No process listening/);
    });
  },
);
