import type { ProjectRegistry } from './project-registry.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';
import type { WorktreeManager } from '../worktree/worktree-manager.js';
import { TicketStore } from '../ticket/ticket-store.js';
import { DEFAULT_BOARD_ID } from './board-config.js';

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
	currentSlug: string,
	deps: {
		projectRegistry: ProjectRegistry;
		launcherConfigManager: LauncherConfigManager;
		worktreeManager: WorktreeManager;
	}
): MigrationResult {
	if (scope === 'none') {
		return { ticketsUpdated: 0, projectsUpdated: 0 };
	}

	let slugs: string[];
	if (scope === 'current') {
		slugs = [currentSlug];
	} else {
		// scope === 'all': find all projects using this board
		try {
			const projects = deps.projectRegistry.listProjects();
			slugs = projects
				.filter(p => {
					try {
						const merged = deps.launcherConfigManager.getMergedConfig(p.slug);
						const projectBoardId = merged.boardId ?? DEFAULT_BOARD_ID;
						return projectBoardId === boardId;
					} catch (e) {
						console.warn(`Skipping project "${p.slug}" during column rename migration: config unreadable`, e);
						return false;
					}
				})
				.map(p => p.slug);
		} catch (e) {
			console.warn('Failed to list projects during column rename migration', e);
			slugs = [];
		}
	}

	let ticketsUpdated = 0;
	let projectsUpdated = 0;

	for (const slug of slugs) {
		let worktreeDir: string;
		try {
			worktreeDir = deps.worktreeManager.getWorktreeDir(slug);
		} catch (e) {
			console.warn(`Skipping project "${slug}" during column rename migration: worktree not resolved`, e);
			continue;
		}

		let projectChanged = false;

		// Update ticket statuses
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
			console.warn(`Skipping ticket migration for project "${slug}": ticket store inaccessible`, e);
		}

		// Re-key columnDefaults
		try {
			const projectConfig = deps.launcherConfigManager.loadProjectConfig(slug);
			if (projectConfig.columnDefaults && Object.prototype.hasOwnProperty.call(projectConfig.columnDefaults, oldColumnName)) {
				const defaults = projectConfig.columnDefaults[oldColumnName];
				projectConfig.columnDefaults[newColumnName] = defaults;
				delete projectConfig.columnDefaults[oldColumnName];
				deps.launcherConfigManager.saveProjectConfig(slug, projectConfig);
				projectChanged = true;
			}
		} catch (e) {
			console.warn(`Skipping columnDefaults re-keying for project "${slug}"`, e);
		}

		if (projectChanged) {
			projectsUpdated++;
		}
	}

	return { ticketsUpdated, projectsUpdated };
}
