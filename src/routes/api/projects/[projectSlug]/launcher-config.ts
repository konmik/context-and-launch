import { launcherConfigManager } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const GET = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const url = new URL(request.url);
	if (url.searchParams.get("raw") === "true") {
		return Response.json(launcherConfigManager.loadProjectConfig(projectSlug));
	}
	return Response.json(launcherConfigManager.getMergedConfig(projectSlug));
});

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const body = await request.json();
	launcherConfigManager.saveProjectConfig(projectSlug, body);
	return new Response(null, { status: 204 });
});
