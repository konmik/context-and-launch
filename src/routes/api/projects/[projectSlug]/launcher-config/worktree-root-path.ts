import { launcherConfigManager } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { worktreeRootPath } = await request.json();
	const value = typeof worktreeRootPath === "string" && worktreeRootPath.trim()
		? worktreeRootPath.trim()
		: undefined;
	launcherConfigManager.saveWorktreeRootPath(projectSlug, value);
	return new Response(null, { status: 204 });
});
