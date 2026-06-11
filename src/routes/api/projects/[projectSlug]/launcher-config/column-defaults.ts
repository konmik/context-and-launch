import { launcherConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { ColumnDefaultsBody } from "~/server/launcher/launcher-config.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { column, ...patch } = await parseBody(request, ColumnDefaultsBody);
	launcherConfigManager.saveColumnDefaults(projectSlug, column, patch);
	return new Response(null, { status: 204 });
});
