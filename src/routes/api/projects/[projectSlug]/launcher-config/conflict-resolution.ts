import { launcherConfigManager } from "~/server/config/instances.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const body = await request.json();
	const prompt = typeof body.conflictResolutionPrompt === "string"
		&& body.conflictResolutionPrompt.trim()
		? body.conflictResolutionPrompt.trim()
		: undefined;
	launcherConfigManager.saveConflictResolutionSettings(projectSlug, prompt);
	return new Response(null, { status: 204 });
});
