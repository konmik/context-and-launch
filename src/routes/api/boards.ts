import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function GET() {
	try {
		const boards = boardConfigManager.listBoards();
		return new Response(JSON.stringify(boards), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}

export async function POST({ request }: APIEvent) {
	try {
		const { name } = await request.json();
		if (!name || typeof name !== "string") {
			return new Response("Missing required field: name", { status: 400 });
		}
		const board = boardConfigManager.createBoard(name);
		return new Response(JSON.stringify(board), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
