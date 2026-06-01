import type { ProjectRegistry } from './project-registry.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';
import type { BoardConfigManager } from './board-config.js';

export function cascadeReassignBoardId(
	deletedBoardId: string,
	deps: {
		projectRegistry: ProjectRegistry;
		launcherConfigManager: LauncherConfigManager;
		boardConfigManager: BoardConfigManager;
	}
): number {
	let reassigned = 0;
	const fallbackBoardId = deps.boardConfigManager.getDefaultBoardId();

	let projects: { projectSlug: string }[];
	try {
		projects = deps.projectRegistry.listProjects();
	} catch (e) {
		console.warn('Failed to list projects during board delete cascade', e);
		return 0;
	}

	for (const project of projects) {
		try {
			const config = deps.launcherConfigManager.loadProjectConfig(project.projectSlug);
			if (config.boardId === deletedBoardId) {
				config.boardId = fallbackBoardId;
				deps.launcherConfigManager.saveProjectConfig(project.projectSlug, config);
				reassigned++;
			}
		} catch (e) {
			console.warn(`Skipping project "${project.projectSlug}" during board delete cascade`, e);
		}
	}

	return reassigned;
}
