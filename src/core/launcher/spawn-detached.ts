import spawn from "cross-spawn";
import crypto from "crypto";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { ProcessError } from "../shared/errors.js";

const crossSpawnParse = createRequire(import.meta.url)("cross-spawn/lib/parse") as (
  command: string, args: string[], options: { cwd: string },
) => { options: { windowsVerbatimArguments?: boolean } };

const DETACH_DELAY_MS = 10000;

const WINDOWS_CONSOLE_HOSTS = new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]);

function requiresOwnConsole(executable: string): boolean {
  return process.platform === "win32"
    && WINDOWS_CONSOLE_HOSTS.has(path.basename(executable).toLowerCase());
}

function rejectMultilineCmdArgs(
  executable: string, args: string[], cwd: string, fullCommand: string,
): void {
  if (process.platform !== "win32") return;
  if (!args.some(a => /[\r\n]/.test(a))) return;
  const parsed = crossSpawnParse(executable, args, { cwd });
  if (parsed.options.windowsVerbatimArguments !== true) return;
  throw new ProcessError(
    fullCommand, undefined,
    "This command runs through cmd.exe on Windows (it is not a .exe), and cmd.exe "
    + "cannot pass arguments containing newlines; the process would silently never start. "
    + "Point the command at a .exe or a PowerShell script (.ps1) instead.",
    `${path.basename(executable)} cannot receive multiline arguments on Windows`,
  );
}

export async function spawnDetached(
  executable: string, args: string[], cwd: string, detachDelayMs = DETACH_DELAY_MS,
): Promise<void> {
  const fullCommand = `${executable} ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  rejectMultilineCmdArgs(executable, args, cwd, fullCommand);
  const label = `${executable} ${args.map(a => a.length > 60 ? a.slice(0, 60) + "..." : a).join(" ")}`;
  console.log(`spawn: ${label} (cwd: ${cwd})`);

  const stderrFile = path.join(os.tmpdir(), `context-launch-stderr-${crypto.randomUUID()}.log`);
  const stderrFd = fs.openSync(stderrFile, "w");
  const ownConsole = requiresOwnConsole(executable);
  const child = spawn(executable, args, {
    cwd,
    detached: !ownConsole,
    windowsHide: !ownConsole,
    stdio: ["ignore", "ignore", stderrFd],
  });
  fs.closeSync(stderrFd);
  const takeStderr = (): string => {
    const text = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    fs.rmSync(stderrFile, { force: true });
    return text;
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    child.on("error", (err) => {
      takeStderr();
      if (settled) return;
      settled = true;
      reject(new ProcessError(fullCommand, undefined, err.message, err.message));
    });

    child.on("exit", (code) => {
      const stderr = takeStderr();
      console.log(`exit ${code}: ${label}`);
      if (stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
      if (settled) return;
      settled = true;
      if (code !== 0 && code !== null) {
        reject(new ProcessError(
          fullCommand, code, stderr.trim() || `Process exited with code ${code}`, `Failed (exit ${code})`,
        ));
      } else if (code === null) {
        reject(new ProcessError(
          fullCommand, undefined,
          stderr.trim() || "Process terminated abnormally", "Process terminated abnormally",
        ));
      } else {
        resolve();
      }
    });

    child.on("spawn", () => {
      child.unref();
      setTimeout(() => {
        if (settled) return;
        settled = true;
        takeStderr();
        resolve();
      }, detachDelayMs);
    });
  });
}
