import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { boardId } = params;
		const { name, description } = await request.json();
		if (!name || typeof name !== "string") {
			return new Response("Missing required field: name", { status: 400 });
		}
		const column = boardConfigManager.addColumn(boardId, name, description);
		return new Response(JSON.stringify(column), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
