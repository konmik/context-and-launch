import { launcherConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { ConflictResolutionBody } from "~/server/launcher/launcher-config.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const body = await parseBody(request, ConflictResolutionBody);
	const prompt = typeof body.conflictResolutionPrompt === "string"
		&& body.conflictResolutionPrompt.trim()
		? body.conflictResolutionPrompt.trim()
		: undefined;
	launcherConfigManager.saveConflictResolutionSettings(projectSlug, prompt);
	return new Response(null, { status: 204 });
});
