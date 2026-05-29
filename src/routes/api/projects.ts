import { projectRegistry, launcherConfigManager, configPaths, configRepo } from "~/server/config/instances.js";
import { generateProjectSlug } from "~/server/project/project-registry.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ request }) => {
	const { path: pathValue, branch, worktreeRootPath, ticketsPath } = await request.json();
	const project = projectRegistry.addProject(
		pathValue, undefined, branch, ticketsPath?.trim() || undefined,
	);
	const trimmedRoot = worktreeRootPath?.trim();
	if (trimmedRoot) {
		configRepo.ensureDir(trimmedRoot);
		launcherConfigManager.saveWorktreeRootPath(project.projectSlug, trimmedRoot);
	}
	return Response.json({ projectSlug: project.projectSlug });
});

export const GET = withService(async ({ request }) => {
	const url = new URL(request.url);
	const pathValue = url.searchParams.get("previewPath");
	if (!pathValue) {
		return Response.json({ error: "Missing previewPath parameter" }, { status: 400 });
	}
	const existing = new Set(projectRegistry.listProjects().map((p) => p.projectSlug));
	const projectSlug = generateProjectSlug(pathValue, existing);
	return Response.json({
		projectSlug,
		ticketsPath: configPaths.ticketWorktreeDir(projectSlug),
		defaultWorktreesPath: configPaths.agentWorktreeDir(projectSlug),
	});
});
