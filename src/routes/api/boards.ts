import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/config/instances.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";

export async function GET() {
	try {
		const boards = boardConfigManager.listBoards();
		return new Response(JSON.stringify(boards), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}

export async function POST({ request }: APIEvent) {
	try {
		const { name } = await request.json();
		if (!name || typeof name !== "string") {
			throw new ValidationError("Missing required field: name");
		}
		const board = boardConfigManager.createBoard(name);
		return new Response(JSON.stringify(board), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
