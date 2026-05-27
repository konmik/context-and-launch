import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { columns } = await request.json();
		if (!Array.isArray(columns)) {
			return new Response("Missing required field: columns (array)", { status: 400 });
		}
		boardConfigManager.reorderColumns(boardId, columns);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
