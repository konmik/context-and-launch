import { projectRegistry } from "~/server/config/instances.js";
import { generateProjectSlug } from "~/server/project/project-registry.js";
import { detectMainBranch } from "~/server/infra/git.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ request }) => {
	const { path: pathValue, branch, mainBranch, boardId, name } = await request.json();
	const project = projectRegistry.addProject(
		pathValue, undefined, branch, undefined,
		mainBranch?.trim() || undefined, boardId?.trim() || undefined,
		name?.trim() || undefined,
	);
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
	let mainBranch: string | undefined;
	try {
		mainBranch = await detectMainBranch(pathValue);
	} catch (err) {
		console.warn("detectMainBranch failed for preview:", err instanceof Error ? err.message : err);
	}
	return Response.json({ projectSlug, mainBranch });
});
