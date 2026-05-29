import { launcherConfigManager } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { boardId } = await request.json();
	if (!boardId || typeof boardId !== "string") {
		throw new ValidationError("Missing required field: boardId");
	}
	const config = launcherConfigManager.loadProjectConfig(projectSlug);
	config.boardId = boardId;
	launcherConfigManager.saveProjectConfig(projectSlug, config);
	return new Response(null, { status: 204 });
});
