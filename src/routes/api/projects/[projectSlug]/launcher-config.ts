import { launcherConfigManager, projectRegistry } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const GET = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const url = new URL(request.url);
	if (url.searchParams.get("raw") === "true") {
		return Response.json(launcherConfigManager.loadProjectConfig(projectSlug));
	}
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	return Response.json({
		...merged,
		projectBoardId: projectRegistry.getBoardId(projectSlug) ?? null,
		projectName: projectRegistry.getName(projectSlug),
	});
});

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const body = await request.json();
	launcherConfigManager.saveProjectConfig(projectSlug, body);
	return new Response(null, { status: 204 });
});
