import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { boardId } = await request.json();
		if (!boardId || typeof boardId !== "string") {
			return new Response("Missing required field: boardId", { status: 400 });
		}
		const config = launcherConfigManager.loadProjectConfig(slug);
		config.boardId = boardId;
		launcherConfigManager.saveProjectConfig(slug, config);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
