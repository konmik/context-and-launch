import fs from "fs";
import { launcherConfigManager, worktreeManager } from "~/server/config/instances.js";
import { NotFoundError, ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";
import { openInOs } from "~/server/infra/open-in-os.js";

function resolveConfigDir(scope: string, projectSlug?: string): string {
  if (scope === "tickets" && projectSlug) return worktreeManager.getWorktreeDir(projectSlug);
  if (scope === "project" && projectSlug) return launcherConfigManager.getProjectDir(projectSlug);
  return launcherConfigManager.getAppConfigDir();
}

export const POST = withService(async ({ request }) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON"); });
  const dir = resolveConfigDir(body.scope, body.projectSlug);
  if (!fs.existsSync(dir)) throw new NotFoundError(`Directory does not exist: ${dir}`);
  await openInOs(dir);
  return new Response(null, { status: 200 });
});
