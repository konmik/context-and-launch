import { projectRegistry } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const GET = withService(async () => {
	return Response.json({ profileName: projectRegistry.getLastUsedProfileName() });
});

export const PUT = withService(async ({ request }) => {
	const { profileName } = await request.json();
	if (!profileName || typeof profileName !== "string") {
		throw new ValidationError("profileName is required");
	}
	projectRegistry.setLastUsedProfileName(profileName);
	return new Response(null, { status: 204 });
}, 400);
