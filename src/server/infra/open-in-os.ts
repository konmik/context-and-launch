import { spawn } from "child_process";

export function platformOpenCommand(): { cmd: string; extraArgs: string[] } {
  if (process.platform === "darwin") return { cmd: "open", extraArgs: [] };
  if (process.platform === "win32") return { cmd: "cmd.exe", extraArgs: ["/c", "start", ""] };
  return { cmd: "xdg-open", extraArgs: [] };
}

export function openInOs(dir: string): Promise<void> {
  if (process.env.CONTEXT_OPEN_IN_OS_STUB === "__noop__") return Promise.resolve();
  const { cmd, extraArgs } = platformOpenCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...extraArgs, dir], { stdio: "ignore" });
    child.once("error", (err) => {
      reject(new Error(`Failed to open ${dir} with ${cmd}: ${err.message}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
