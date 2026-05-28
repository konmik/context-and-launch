import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/config/instances.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { columns } = await request.json();
		if (!Array.isArray(columns)) {
			throw new ValidationError("Missing required field: columns (array)");
		}
		boardConfigManager.reorderColumns(boardId, columns);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
