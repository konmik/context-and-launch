import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { boardId } = await request.json();
		if (!boardId || typeof boardId !== "string") {
			throw new ValidationError("Missing required field: boardId");
		}
		const config = launcherConfigManager.loadProjectConfig(projectSlug);
		config.boardId = boardId;
		launcherConfigManager.saveProjectConfig(projectSlug, config);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}
