import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { boardId, columnName } = params;
		const { description } = await request.json();
		boardConfigManager.updateColumn(boardId, columnName, { description });
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function DELETE({ params }: APIEvent) {
	try {
		const { boardId, columnName } = params;
		boardConfigManager.removeColumn(boardId, columnName);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
