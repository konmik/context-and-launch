import type { APIEvent } from "@solidjs/start/server";
import { boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager } from "~/server/instances.js";
import { migrateColumnRename, type MigrationScope } from "~/server/column-rename-migration.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { boardId, columnName } = params;
		const { newName, scope, currentSlug } = await request.json();
		if (!newName || typeof newName !== "string") {
			return new Response("Missing required field: newName", { status: 400 });
		}
		const validScopes: MigrationScope[] = ["all", "current", "none"];
		if (!validScopes.includes(scope)) {
			return new Response("Invalid scope: must be all, current, or none", { status: 400 });
		}
		if (scope === "current" && (!currentSlug || typeof currentSlug !== "string")) {
			return new Response("Missing required field: currentSlug (required when scope is 'current')", { status: 400 });
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
		return new Response(errorMessage(e), { status: 400 });
	}
}
