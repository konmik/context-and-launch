import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { runDetachedProcess } from "../command-template/platform-shell-runner.test-utils.js";

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

    it("prompt arrives when title contains double quotes", async () => {
      const dir = makeTempDir();
      const outputPath = path.join(dir, "received.txt");
      const markerPath = path.join(dir, "marker.json");
      const windowTitle =
        `Fix "auth" bug ${crypto.randomUUID().slice(0, 8)} -- AI`;
      windowTitles.push(windowTitle);

      const agentScript = path.join(dir, "agent.ps1");
      fs.writeFileSync(
        agentScript,
        `Set-Content -LiteralPath '${outputPath}' -Value $args[0]`,
      );

      await runDetachedProcess(
        "powershell",
        [
          "-File", SCRIPT_PATH, "hello",
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
          + " - double quote in title broke Start-Process",
      ).toBe(true);
      expect(fs.readFileSync(outputPath, "utf-8").trim()).toBe("hello");
    }, 30000);

    it("prompt arrives when title contains apostrophe", async () => {
      const dir = makeTempDir();
      const outputPath = path.join(dir, "received.txt");
      const markerPath = path.join(dir, "marker.json");
      const windowTitle =
        `it's a test ${crypto.randomUUID().slice(0, 8)} -- AI`;
      windowTitles.push(windowTitle);

      const agentScript = path.join(dir, "agent.ps1");
      fs.writeFileSync(
        agentScript,
        `Set-Content -LiteralPath '${outputPath}' -Value $args[0]`,
      );

      await runDetachedProcess(
        "powershell",
        [
          "-File", SCRIPT_PATH, "hello",
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

describe.runIf(process.platform === "win32")(
  "run-agent.ps1 agent command",
  () => {
    it("passes a multiline prompt as one positional argument", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-agent-ps1-argv-"));
      const markerPath = path.join(dir, "marker.json");
      const outputPath = path.join(dir, "received.json");
      const agentScript = path.join(dir, "agent.ps1");
      const prompt = "first line\nsecond line with 'quotes' and $variables";
      fs.writeFileSync(
        agentScript,
        `($args | ConvertTo-Json -Compress) | Set-Content -LiteralPath $args[0]`,
      );
      const command = [
        "powershell", "-NoProfile", "-File", agentScript, outputPath, prompt,
      ];

      const result = spawnSync(
        "powershell",
        ["-NoProfile", "-File", SCRIPT_PATH, "-selfLaunch"],
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            CL_AGENT_MARKER: markerPath,
            CL_AGENT_INVOCATION_JSON: JSON.stringify({
              executable: command[0],
              arguments: command.slice(1),
            }),
          },
        },
      );

      try {
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toEqual([
          outputPath,
          prompt,
        ]);
        expect(fs.existsSync(markerPath)).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);
