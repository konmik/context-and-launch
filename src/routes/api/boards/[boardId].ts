import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager, projectRegistry, launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";
import { cascadeClearBoardId } from "~/server/project/board-delete-cascade.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { name } = await request.json();
		if (!name || typeof name !== "string") {
			throw new ValidationError("Missing required field: name");
		}
		boardConfigManager.renameBoard(boardId, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export async function DELETE({ params }: APIEvent) {
	try {
		const { boardId } = params;
		boardConfigManager.deleteBoard(boardId);
		cascadeClearBoardId(boardId, { projectRegistry, launcherConfigManager });
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}