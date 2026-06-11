import fs from "fs";
import * as v from "valibot";
import { launcherConfigManager, worktreeManager } from "~/server/config/instances.js";
import { NotFoundError } from "~/server/shared/errors.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { openInOs } from "~/server/infra/open-in-os.js";

const OpenConfigDirBody = v.object({
  scope: v.optional(v.string()),
  projectSlug: v.optional(v.string()),
});

function resolveConfigDir(scope: string | undefined, projectSlug?: string): string {
  if (scope === "tickets" && projectSlug) return worktreeManager.getWorktreeDir(projectSlug);
  if (scope === "project" && projectSlug) return launcherConfigManager.getProjectDir(projectSlug);
  return launcherConfigManager.getAppConfigDir();
}

export const POST = withService(async ({ request }) => {
  const body = await parseBody(request, OpenConfigDirBody);
  const dir = resolveConfigDir(body.scope, body.projectSlug);
  if (!fs.existsSync(dir)) throw new NotFoundError(`Directory does not exist: ${dir}`);
  await openInOs(dir);
  return new Response(null, { status: 200 });
});
