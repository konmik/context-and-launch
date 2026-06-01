import { launcherConfigManager, agentWorktreeManager, projectRegistry } from "~/server/config/instances.js";
import { WorktreeCleanupService } from "~/server/worktree/worktree-cleanup.js";
import { ValidationError, NotFoundError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { folderName, options } = await request.json();
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	if (!merged.worktreeRootPath) throw new ValidationError("Worktree root path is not configured");
	const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug);
	if (!project) throw new NotFoundError("Project not found");
	const worktreePath = `${merged.worktreeRootPath}/${folderName}`;
	await new WorktreeCleanupService(agentWorktreeManager).cleanup(
		project.path, folderName, worktreePath, options, project.mainBranch,
	);
	return Response.json({ success: true });
});
