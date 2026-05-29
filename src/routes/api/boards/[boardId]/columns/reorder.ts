import { boardConfigManager } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { columns } = await request.json();
	if (!Array.isArray(columns)) {
		throw new ValidationError("Missing required field: columns (array)");
	}
	boardConfigManager.reorderColumns(boardId, columns);
	return new Response(null, { status: 204 });
}, 400);
