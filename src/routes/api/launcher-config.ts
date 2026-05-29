import { launcherConfigManager } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const GET = withService(async () => {
	return Response.json(launcherConfigManager.loadAppConfig());
});

export const PUT = withService(async ({ request }) => {
	const body = await request.json();
	launcherConfigManager.saveAppConfig(body);
	return new Response(null, { status: 204 });
});
