import type { ProjectRegistry } from './project-registry.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';
import type { WorktreeManager } from '../worktree/worktree-manager.js';
import type { BoardConfigManager } from './board-config.js';
import { TicketStore } from '../ticket/ticket-store.js';

export type MigrationScope = 'all' | 'current' | 'none';

export interface MigrationResult {
	ticketsUpdated: number;
	projectsUpdated: number;
}

export function migrateColumnRename(
	boardId: string,
	oldColumnName: string,
	newColumnName: string,
	scope: MigrationScope,
	currentProjectSlug: string,
	deps: {
		projectRegistry: ProjectRegistry;
		launcherConfigManager: LauncherConfigManager;
		worktreeManager: WorktreeManager;
		boardConfigManager: BoardConfigManager;
	}
): MigrationResult {
	if (scope === 'none') {
		return { ticketsUpdated: 0, projectsUpdated: 0 };
	}

	let projectSlugs: string[];
	if (scope === 'current') {
		projectSlugs = [currentProjectSlug];
	} else {
		try {
			const defaultBoardId = deps.boardConfigManager.getDefaultBoardId();
			const projects = deps.projectRegistry.listProjects();
			projectSlugs = projects
				.filter(p => {
					const projectBoardId = p.boardId ?? defaultBoardId;
					return projectBoardId === boardId;
				})
				.map(p => p.projectSlug);
		} catch (e) {
			console.warn('Failed to list projects during column rename migration', e);
			projectSlugs = [];
		}
	}

	let ticketsUpdated = 0;
	let projectsUpdated = 0;

	for (const projectSlug of projectSlugs) {
		let worktreeDir: string;
		try {
			worktreeDir = deps.worktreeManager.getWorktreeDir(projectSlug);
		} catch (e) {
			console.warn(`Skipping project "${projectSlug}" during column rename migration: worktree not resolved`, e);
			continue;
		}

		let projectChanged = false;

		try {
			const store = new TicketStore(worktreeDir);
			const tickets = store.listTickets();
			for (const ticket of tickets) {
				if (ticket.status === oldColumnName) {
					store.updateTicket(ticket.folderName, null, null, newColumnName);
					ticketsUpdated++;
					projectChanged = true;
				}
			}
		} catch (e) {
			console.warn(`Skipping ticket migration for project "${projectSlug}": ticket store inaccessible`, e);
		}

		try {
			const projectConfig = deps.launcherConfigManager.loadProjectConfig(projectSlug);
			if (projectConfig.columnDefaults
				&& Object.prototype.hasOwnProperty.call(projectConfig.columnDefaults, oldColumnName)) {
				const defaults = projectConfig.columnDefaults[oldColumnName];
				projectConfig.columnDefaults[newColumnName] = defaults;
				delete projectConfig.columnDefaults[oldColumnName];
				deps.launcherConfigManager.saveProjectConfig(projectSlug, projectConfig);
				projectChanged = true;
			}
		} catch (e) {
			console.warn(`Skipping columnDefaults re-keying for project "${projectSlug}"`, e);
		}

		if (projectChanged) {
			projectsUpdated++;
		}
	}

	return { ticketsUpdated, projectsUpdated };
}

export interface ColumnRenameDeps {
	boardConfigManager: BoardConfigManager;
	projectRegistry: ProjectRegistry;
	launcherConfigManager: LauncherConfigManager;
	worktreeManager: WorktreeManager;
}

export function renameColumnWithMigration(
	boardId: string,
	columnName: string,
	newName: string,
	scope: MigrationScope,
	currentProjectSlug: string,
	deps: ColumnRenameDeps,
): { newName: string; ticketsUpdated: number; projectsUpdated: number } {
	const result = deps.boardConfigManager.renameColumn(boardId, columnName, newName);
	let migration;
	try {
		migration = migrateColumnRename(boardId, columnName, result.newName, scope, currentProjectSlug, deps);
	} catch (migrationError) {
		try {
			deps.boardConfigManager.renameColumn(boardId, result.newName, columnName);
		} catch (rollbackError) {
			console.error('Column rename rollback failed', rollbackError);
		}
		throw migrationError;
	}
	return {
		newName: result.newName,
		ticketsUpdated: migration.ticketsUpdated,
		projectsUpdated: migration.projectsUpdated,
	};
}
