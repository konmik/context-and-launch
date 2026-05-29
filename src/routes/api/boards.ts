import { boardConfigManager } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const GET = withService(async () => {
	return Response.json(boardConfigManager.listBoards());
});

export const POST = withService(async ({ request }) => {
	const { name } = await request.json();
	if (!name || typeof name !== "string") {
		throw new ValidationError("Missing required field: name");
	}
	const board = boardConfigManager.createBoard(name);
	return Response.json(board, { status: 201 });
}, 400);
