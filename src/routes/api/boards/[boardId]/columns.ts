import { boardConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { AddColumnBody } from "~/server/board/board-types.js";

export const POST = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { name, description } = await parseBody(request, AddColumnBody);
	const column = boardConfigManager.addColumn(boardId, name, description);
	return Response.json(column, { status: 201 });
}, 400);
