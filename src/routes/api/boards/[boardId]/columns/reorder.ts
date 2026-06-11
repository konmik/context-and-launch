import { boardConfigManager } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { ReorderColumnsBody } from "~/server/board/board-types.js";

export const PUT = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { columns } = await parseBody(request, ReorderColumnsBody);
	boardConfigManager.reorderColumns(boardId, columns);
	return new Response(null, { status: 204 });
}, 400);
