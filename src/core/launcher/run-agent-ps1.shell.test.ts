import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnDetached } from "./spawn-detached.js";

const SCRIPT_PATH = path.resolve(
  __dirname, "../../../config-defaults/run-agent.ps1",
);

function closeWindowByTitle(title: string): void {
  const escaped = title.replace(/'/g, "''");
  try {
    execFileSync("powershell", [
      "-NoProfile", "-Command",
      `Get-Process WindowsTerminal -EA 0`
        + ` | ? { $_.MainWindowTitle -eq '${escaped}' }`
        + ` | % { $_.CloseMainWindow() } | Out-Null`,
    ], { timeout: 5000 });
  } catch {}
}

describe.runIf(process.platform === "win32")(
  "run-agent.ps1 prompt delivery (real WT window)",
  () => {
    const tempDirs: string[] = [];
    const windowTitles: string[] = [];

    function makeTempDir() {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "run-agent-ps1-test-"),
      );
      tempDirs.push(dir);
      return dir;
    }

    afterEach(async () => {
      for (const title of windowTitles) closeWindowByTitle(title);
      windowTitles.length = 0;
      await new Promise(r => setTimeout(r, 1000));

      while (tempDirs.length > 0) {
        const dir = tempDirs.pop()!;
        const deadline = Date.now() + 5000;
        for (;;) {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
            break;
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (
              (code !== "EBUSY" && code !== "ENOTEMPTY"
                && code !== "EPERM")
              || Date.now() > deadline
            ) throw e;
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
    });

    it("prompt arrives when title contains apostrophe", async () => {
      const dir = makeTempDir();
      const outputPath = path.join(dir, "received.txt");
      const markerPath = path.join(dir, "marker.json");
      const windowTitle =
        `it's a test ${crypto.randomUUID().slice(0, 8)} -- AI`;
      windowTitles.push(windowTitle);

      const agentScript = path.join(dir, "agent.ps1");
      fs.writeFileSync(agentScript, [
        `$line = [Console]::ReadLine()`,
        `Set-Content -LiteralPath '${outputPath}' -Value $line`,
      ].join("\r\n"));

      await spawnDetached(
        "powershell",
        [
          "-File", SCRIPT_PATH, "hello<<ENTER>>",
          windowTitle, markerPath,
          "powershell", "-NoProfile", "-File", agentScript,
        ],
        dir,
      );

      const deadline = Date.now() + 20000;
      while (!fs.existsSync(outputPath) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
      }

      expect(
        fs.existsSync(outputPath),
        "Agent never received input"
          + " - apostrophe in title broke AppActivate",
      ).toBe(true);
      expect(fs.readFileSync(outputPath, "utf-8").trim()).toBe("hello");
    }, 30000);
  },
);
