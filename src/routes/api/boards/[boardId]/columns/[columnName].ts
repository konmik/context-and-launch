import { boardConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { UpdateColumnBody } from "~/server/board/board-types.js";

export const PUT = withService(async ({ params, request }) => {
	const { boardId, columnName } = params;
	const { description } = await parseBody(request, UpdateColumnBody);
	boardConfigManager.updateColumn(boardId, columnName, { description });
	return new Response(null, { status: 204 });
}, 400);

export const DELETE = withService(async ({ params }) => {
	const { boardId, columnName } = params;
	boardConfigManager.removeColumn(boardId, columnName);
	return new Response(null, { status: 204 });
}, 400);
