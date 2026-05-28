import type { APIEvent } from "@solidjs/start/server";
import { spawn } from "child_process";
import { launcherConfigManager, worktreeManager } from "~/server/config/instances.js";

export async function POST({ request }: APIEvent) {
  let body: { scope: string; projectSlug?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  let dir: string;
  if (body.scope === "tickets" && body.projectSlug) {
    dir = worktreeManager.getWorktreeDir(body.projectSlug);
  } else if (body.scope === "worktree" && body.projectSlug) {
    const config = launcherConfigManager.loadProjectConfig(body.projectSlug);
    if (!config.worktreeRootPath) {
      return new Response("Worktree root path not configured", { status: 400 });
    }
    dir = config.worktreeRootPath;
  } else if (body.scope === "project" && body.projectSlug) {
    dir = launcherConfigManager.getProjectConfigDir(body.projectSlug);
  } else {
    dir = launcherConfigManager.getAppConfigDir();
  }

  const cmd = process.platform === "darwin" ? "open" : "explorer.exe";
  spawn(cmd, [dir], { stdio: "ignore" }).unref();

  return new Response(null, { status: 200 });
}
