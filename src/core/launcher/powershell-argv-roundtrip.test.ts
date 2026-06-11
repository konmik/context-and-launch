import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnDetached } from "./spawn-detached.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ps-argv-roundtrip-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe.runIf(process.platform === "win32")(
  "powershell -File argv round-trip (agent-launch quoting)",
  () => {
    it("delivers quote-laden ticket-title args intact and in position", async () => {
      const dir = makeTempDir();
      const probePath = path.join(dir, "probe.ps1");
      const outPath = path.join(dir, "out.json");
      fs.writeFileSync(
        probePath,
        "param([switch]$selfLaunch)\r\n" +
        "($args | ConvertTo-Json -Compress) | Set-Content -LiteralPath $args[$args.Length-1]\r\n",
      );
      const sent = [
        'Current ticket: Fix "auth" bug. Read the files in C:\\dir\\ for context.\nSecond line.',
        'Fix "auth" bug -- AI',
        "C:\\Users\\some user\\.context-launch\\running\\proj\\st-1-fix.json",
        "claude",
        "--dangerously-skip-permissions",
        'trailing backslash\\',
        'backslash before quote \\" inside',
      ];
      await spawnDetached("powershell", ["-File", probePath, ...sent, outPath], dir);
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(outPath)) {
        if (Date.now() > deadline) {
          throw new Error(`probe output never appeared; dir: ${fs.readdirSync(dir).join(", ")}`);
        }
        await new Promise(r => setTimeout(r, 50));
      }
      const received: string[] = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      expect(received).toEqual([...sent, outPath]);
    }, 30000);
  },
);
