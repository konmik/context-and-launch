import {
	boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
} from "~/server/config/instances.js";
import { renameColumnWithMigration, type MigrationScope } from "~/server/project/column-rename-migration.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { boardId, columnName } = params;
	const { newName, scope, currentProjectSlug } = await request.json();
	if (!newName || typeof newName !== "string") throw new ValidationError("Missing required field: newName");
	const validScopes: MigrationScope[] = ["all", "current", "none"];
	if (!validScopes.includes(scope)) throw new ValidationError("Invalid scope: must be all, current, or none");
	if (scope === "current" && (!currentProjectSlug || typeof currentProjectSlug !== "string")) {
		throw new ValidationError("Missing required field: currentProjectSlug (required when scope is 'current')");
	}
	const result = renameColumnWithMigration(boardId, columnName, newName, scope, currentProjectSlug, {
		boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
	});
	return Response.json(result);
}, 400);
