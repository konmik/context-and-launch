import { boardConfigManager, projectRegistry, launcherConfigManager } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { cascadeReassignBoardId } from "~/server/project/board-delete-cascade.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { boardId } = params;
	const { name } = await request.json();
	if (!name || typeof name !== "string") {
		throw new ValidationError("Missing required field: name");
	}
	boardConfigManager.renameBoard(boardId, name);
	return new Response(null, { status: 204 });
}, 400);

export const DELETE = withService(async ({ params }) => {
	const { boardId } = params;
	boardConfigManager.deleteBoard(boardId);
	cascadeReassignBoardId(boardId, { projectRegistry, launcherConfigManager, boardConfigManager });
	return new Response(null, { status: 204 });
}, 400);
