import { projectRegistry } from "~/server/config/instances.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { SetBoardIdBody } from "~/server/launcher/launcher-config.js";

export const PUT = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { boardId } = await parseBody(request, SetBoardIdBody);
	projectRegistry.setBoardId(projectSlug, boardId);
	return new Response(null, { status: 204 });
});
