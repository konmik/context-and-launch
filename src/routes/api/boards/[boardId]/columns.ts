import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/config/instances.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { name, description } = await request.json();
		if (!name || typeof name !== "string") {
			throw new ValidationError("Missing required field: name");
		}
		const column = boardConfigManager.addColumn(boardId, name, description);
		return new Response(JSON.stringify(column), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
