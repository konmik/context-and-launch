import { launcherConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { WorktreeRootPathBody } from "~/server/launcher/launcher-config.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { worktreeRootPath } = await parseBody(request, WorktreeRootPathBody);
	const value = typeof worktreeRootPath === "string" && worktreeRootPath.trim()
		? worktreeRootPath.trim()
		: undefined;
	launcherConfigManager.saveWorktreeRootPath(projectSlug, value);
	return new Response(null, { status: 204 });
});
