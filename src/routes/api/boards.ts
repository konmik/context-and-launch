import { boardConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { CreateBoardBody } from "~/server/board/board-types.js";

export const GET = withService(async () => {
	return Response.json(boardConfigManager.listBoards());
});

export const POST = withService(async ({ request }) => {
	const { name } = await parseBody(request, CreateBoardBody);
	const board = boardConfigManager.createBoard(name);
	return Response.json(board, { status: 201 });
}, 400);
