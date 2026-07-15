import { spawn } from "child_process";
import { appLog } from "./app-logger.js";

export function openInOs(dir: string): Promise<void> {
  if (process.env.CONTEXT_OPEN_IN_OS_STUB === "__noop__") return Promise.resolve();
  const isWin = process.platform === "win32";
  const cmd = process.platform === "darwin" ? "open" : isWin ? "explorer.exe" : "xdg-open";
  appLog('exec', `${cmd} ${dir}`);
  return new Promise((resolve, reject) => {
    // detached on win32 severs inheritance of the parent server's hidden-window
    // show state (run.ps1 starts node with -WindowStyle Hidden). Without it the
    // folder window opens behind the active window instead of in the foreground.
    const child = spawn(cmd, [dir], { stdio: "ignore", detached: isWin, windowsHide: false });
    child.once("error", (err) => {
      reject(new Error(`Failed to open ${dir} with ${cmd}: ${err.message}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
