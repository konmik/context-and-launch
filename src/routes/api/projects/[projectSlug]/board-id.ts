import { projectRegistry } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const body = await request.json();
	const boardId = body?.boardId;
	if (!boardId || typeof boardId !== "string") {
		throw new ValidationError("Missing required field: boardId");
	}
	projectRegistry.setBoardId(projectSlug, boardId);
	return new Response(null, { status: 204 });
});
