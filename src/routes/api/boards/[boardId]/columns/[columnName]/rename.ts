import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager } from "~/server/config/instances.js";
import { migrateColumnRename, type MigrationScope } from "~/server/project/column-rename-migration.js";
import { errorMessage, ValidationError } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { boardId, columnName } = params;
		const { newName, scope, currentSlug } = await request.json();
		if (!newName || typeof newName !== "string") {
			throw new ValidationError("Missing required field: newName");
		}
		const validScopes: MigrationScope[] = ["all", "current", "none"];
		if (!validScopes.includes(scope)) {
			throw new ValidationError("Invalid scope: must be all, current, or none");
		}
		if (scope === "current" && (!currentSlug || typeof currentSlug !== "string")) {
			throw new ValidationError("Missing required field: currentSlug (required when scope is 'current')");
		}
		const result = boardConfigManager.renameColumn(boardId, columnName, newName);
		let migration;
		try {
			migration = migrateColumnRename(boardId, columnName, result.newName, scope, currentSlug, {
				projectRegistry,
				launcherConfigManager,
				worktreeManager,
			});
		} catch (migrationError) {
			// Rollback: restore the original column name so board config stays consistent
			try {
				boardConfigManager.renameColumn(boardId, result.newName, columnName);
			} catch (rollbackError) {
				console.error('Column rename rollback failed', rollbackError);
			}
			throw migrationError;
		}
		return new Response(JSON.stringify({
			newName: result.newName,
			ticketsUpdated: migration.ticketsUpdated,
			projectsUpdated: migration.projectsUpdated,
		}), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
