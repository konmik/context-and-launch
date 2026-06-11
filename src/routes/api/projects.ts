import { configPaths, launcherConfigManager, projectRegistry, worktreeManager } from "~/server/config/instances.js";
import { detectMainBranch } from "~/server/infra/git.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { AddProjectBody } from "~/server/project/project-registry.js";

export const POST = withService(async ({ request }) => {
	const body = await parseBody(request, AddProjectBody);
	const projectSlug = projectRegistry.previewSlug(body.path);
	await worktreeManager.ensureWorktree(body.path, projectSlug, body.branch);
	const project = projectRegistry.addProject(body.path, {
		branch: body.branch,
		mainBranch: body.mainBranch?.trim() || undefined,
		boardId: body.boardId?.trim() || undefined,
		name: body.name?.trim() || undefined,
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
