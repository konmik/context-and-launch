import type { ProjectRegistry } from './project-registry.js';
import type { LauncherConfigManager } from './launcher-config.js';

/**
 * After deleting a board, clear boardId from any project launcher config
 * that references the deleted board. This prevents silent fallback to the
 * first board (which ADR 0009 explicitly rejected) and instead causes
 * those projects to use the default board (null boardId).
 */
export function cascadeClearBoardId(
	deletedBoardId: string,
	deps: {
		projectRegistry: ProjectRegistry;
		launcherConfigManager: LauncherConfigManager;
	}
): number {
	let cleared = 0;

	let projects: { slug: string }[];
	try {
		projects = deps.projectRegistry.listProjects();
	} catch (e) {
		console.warn('Failed to list projects during board delete cascade', e);
		return 0;
	}

	for (const project of projects) {
		try {
			const config = deps.launcherConfigManager.loadProjectConfig(project.slug);
			if (config.boardId === deletedBoardId) {
				config.boardId = undefined;
				deps.launcherConfigManager.saveProjectConfig(project.slug, config);
				cleared++;
			}
		} catch (e) {
			console.warn(`Skipping project "${project.slug}" during board delete cascade`, e);
		}
	}

	return cleared;
}
