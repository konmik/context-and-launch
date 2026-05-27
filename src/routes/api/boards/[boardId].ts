import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager, projectRegistry, launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";
import { cascadeClearBoardId } from "~/server/board-delete-cascade.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { name } = await request.json();
		if (!name || typeof name !== "string") {
			return new Response("Missing required field: name", { status: 400 });
		}
		boardConfigManager.renameBoard(boardId, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function DELETE({ params }: APIEvent) {
	try {
		const { boardId } = params;
		boardConfigManager.deleteBoard(boardId);
		cascadeClearBoardId(boardId, { projectRegistry, launcherConfigManager });
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
