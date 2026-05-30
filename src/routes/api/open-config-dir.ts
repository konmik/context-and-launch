import { spawn } from "child_process";
import fs from "fs";
import { launcherConfigManager, worktreeManager } from "~/server/config/instances.js";
import { NotFoundError, ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

function resolveConfigDir(scope: string, projectSlug?: string): string {
  if (scope === "tickets" && projectSlug) return worktreeManager.getWorktreeDir(projectSlug);
  if (scope === "worktree" && projectSlug) {
    const config = launcherConfigManager.loadProjectConfig(projectSlug);
    if (!config.worktreeRootPath) throw new ValidationError("Worktree root path not configured");
    return config.worktreeRootPath;
  }
  if (scope === "project" && projectSlug) return launcherConfigManager.getProjectConfigDir(projectSlug);
  return launcherConfigManager.getAppConfigDir();
}

export function platformOpenCommand(): { cmd: string; extraArgs: string[] } {
  if (process.platform === "darwin") return { cmd: "open", extraArgs: [] };
  if (process.platform === "win32") return { cmd: "explorer.exe", extraArgs: [] };
  return { cmd: "xdg-open", extraArgs: [] };
}

export function openInOs(dir: string): Promise<void> {
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

export const POST = withService(async ({ request }) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON"); });
  const dir = resolveConfigDir(body.scope, body.projectSlug);
  if (!fs.existsSync(dir)) throw new NotFoundError(`Directory does not exist: ${dir}`);
  await openInOs(dir);
  return new Response(null, { status: 200 });
});
