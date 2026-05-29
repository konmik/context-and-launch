import { launcherConfigManager } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { column, ...patch } = await request.json();
	launcherConfigManager.saveColumnDefaults(projectSlug, column, patch);
	return new Response(null, { status: 204 });
});
