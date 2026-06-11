import {
	boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
} from "~/server/config/instances.js";
import { renameColumnWithMigration } from "~/server/project/column-rename-migration.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { RenameColumnBody } from "~/server/board/board-types.js";

export const POST = withService(async ({ params, request }) => {
	const { boardId, columnName } = params;
	const { newName, scope, currentProjectSlug } = await parseBody(request, RenameColumnBody);
	if (scope === "current" && !currentProjectSlug) {
		throw new ValidationError("Missing required field: currentProjectSlug (required when scope is 'current')");
	}
	const result = renameColumnWithMigration(boardId, columnName, newName, scope, currentProjectSlug ?? "", {
		boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
	});
	return Response.json(result);
}, 400);
