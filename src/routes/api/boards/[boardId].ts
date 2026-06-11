import { boardConfigManager, projectRegistry } from "~/server/config/instances.js";
import { cascadeClearBoardId } from "~/server/project/board-delete-cascade.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { RenameBoardBody } from "~/server/board/board-types.js";

export const PUT = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { name } = await parseBody(request, RenameBoardBody);
	boardConfigManager.renameBoard(boardId, name);
	return new Response(null, { status: 204 });
}, 400);

export const DELETE = withService(async ({ params }) => {
	const { boardId } = params;
	boardConfigManager.deleteBoard(boardId);
	cascadeClearBoardId(boardId, { projectRegistry });
	return new Response(null, { status: 204 });
}, 400);
