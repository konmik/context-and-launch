import { projectRegistry } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { name } = await request.json();
	projectRegistry.setName(projectSlug, name);
	return new Response(null, { status: 204 });
});
