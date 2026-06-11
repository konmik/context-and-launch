import { projectRegistry } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { SetProjectNameBody } from "~/server/launcher/launcher-config.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { name } = await parseBody(request, SetProjectNameBody);
	projectRegistry.setName(projectSlug, name);
	return new Response(null, { status: 204 });
});
