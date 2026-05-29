import { boardConfigManager } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { name, description } = await request.json();
	if (!name || typeof name !== "string") {
		throw new ValidationError("Missing required field: name");
	}
	const column = boardConfigManager.addColumn(boardId, name, description);
	return Response.json(column, { status: 201 });
}, 400);
