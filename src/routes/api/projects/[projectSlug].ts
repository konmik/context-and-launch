import { projectRegistry } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const DELETE = withService(async ({ params }) => {
	const projectSlug = params.projectSlug;
	const exists = projectRegistry.listProjects().some((p) => p.projectSlug === projectSlug);
	if (!exists) {
		return Response.json({ error: `Project not found: ${projectSlug}` }, { status: 404 });
	}
	projectRegistry.removeProject(projectSlug);
	return Response.json({ success: true });
});
