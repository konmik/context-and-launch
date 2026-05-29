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
	currentProjectSlug: string,
	deps: {
		projectRegistry: ProjectRegistry;
		launcherConfigManager: LauncherConfigManager;
		worktreeManager: WorktreeManager;
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
			const projects = deps.projectRegistry.listProjects();
			projectSlugs = projects
				.filter(p => {
					try {
						const merged = deps.launcherConfigManager.getMergedConfig(p.projectSlug);
						const projectBoardId = merged.boardId ?? DEFAULT_BOARD_ID;
						return projectBoardId === boardId;
					} catch (e) {
						console.warn(
				`Skipping project "${p.projectSlug}" during column rename migration: config unreadable`, e,
			);
						return false;
					}
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
