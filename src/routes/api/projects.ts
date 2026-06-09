import { configPaths, launcherConfigManager, projectRegistry, worktreeManager } from "~/server/config/instances.js";
import { detectMainBranch } from "~/server/infra/git.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ request }) => {
	const { path: pathValue, branch, mainBranch, boardId, name } = await request.json();
	const projectSlug = projectRegistry.previewSlug(pathValue);
	await worktreeManager.ensureWorktree(pathValue, projectSlug, branch);
	const project = projectRegistry.addProject(pathValue, {
		branch,
		mainBranch: mainBranch?.trim() || undefined,
		boardId: boardId?.trim() || undefined,
		name: name?.trim() || undefined,
	});
	launcherConfigManager.saveWorktreeRootPath(
		project.projectSlug,
		configPaths.agentWorktreeDir(project.projectSlug),
	);
	return Response.json({ projectSlug: project.projectSlug });
});

export const GET = withService(async ({ request }) => {
	const url = new URL(request.url);
	const pathValue = url.searchParams.get("previewPath");
	if (!pathValue) {
		return Response.json({ error: "Missing previewPath parameter" }, { status: 400 });
	}
	const projectSlug = projectRegistry.previewSlug(pathValue);
	let mainBranch: string | undefined;
	try {
		mainBranch = await detectMainBranch(pathValue);
	} catch (err) {
		console.warn("detectMainBranch failed for preview:", err instanceof Error ? err.message : err);
	}
	return Response.json({ projectSlug, mainBranch });
});
