import { projectRegistry } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { ProfileNameBody } from "~/server/launcher/launcher-config.js";

export const GET = withService(async () => {
	return Response.json({ profileName: projectRegistry.getLastUsedProfileName() });
});

export const PUT = withService(async ({ request }) => {
	const { profileName } = await parseBody(request, ProfileNameBody);
	projectRegistry.setLastUsedProfileName(profileName);
	return new Response(null, { status: 204 });
}, 400);
