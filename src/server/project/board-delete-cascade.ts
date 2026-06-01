import type { ProjectRegistry } from './project-registry.js';

export function cascadeClearBoardId(
	deletedBoardId: string,
	deps: {
		projectRegistry: ProjectRegistry;
	}
): number {
	let cleared = 0;

	let projects: { projectSlug: string; boardId?: string }[];
	try {
		projects = deps.projectRegistry.listProjects();
	} catch (e) {
		console.warn('Failed to list projects during board delete cascade', e);
		return 0;
	}

	for (const project of projects) {
		try {
			if (project.boardId === deletedBoardId) {
				deps.projectRegistry.setBoardId(project.projectSlug, undefined);
				cleared++;
			}
		} catch (e) {
			console.warn(`Skipping project "${project.projectSlug}" during board delete cascade`, e);
		}
	}

	return cleared;
}
