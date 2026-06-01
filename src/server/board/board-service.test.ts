import { describe, it, expect, vi } from 'vitest';
import { BoardService } from './board-service.js';
import type { ProjectRegistry, ProjectInfo } from '~/server/project/project-registry.js';
import type { BoardConfigManager } from '~/server/project/board-config.js';
import type { WorktreeManager } from '~/server/worktree/worktree-manager.js';
import type { FileWatcher } from '~/server/infra/file-watcher.js';
import type { LauncherConfigManager } from '~/server/launcher/launcher-config.js';
import type { TicketSyncManager } from '~/server/ticket/ticket-sync.js';

function stubDeps(overrides: { projects?: ProjectInfo[] } = {}) {
	const projects: ProjectInfo[] = overrides.projects ?? [];

	const projectRegistry = {
		setLastUsed: vi.fn(),
		listProjects: vi.fn(() => projects),
	} as unknown as ProjectRegistry;

	const boardConfigManager = {} as BoardConfigManager;
	const worktreeManager = {} as WorktreeManager;
	const fileWatcher = {} as FileWatcher;
	const launcherConfigManager = {} as LauncherConfigManager;
	const ticketSyncManager = {} as TicketSyncManager;

	const service = new BoardService(
		projectRegistry,
		boardConfigManager,
		worktreeManager,
		fileWatcher,
		launcherConfigManager,
		ticketSyncManager,
	);

	return { service, projectRegistry };
}

describe('BoardService.loadBoard', () => {
	it('does not persist lastUsed for a known-but-unavailable project', async () => {
		const { service, projectRegistry } = stubDeps({
			projects: [
				{ path: '/deleted/path', projectSlug: 'gone', available: false, boardId: 'standard' },
			],
		});

		const result = await service.loadBoard('gone');

		expect(result.status).toBe('unavailable');
		expect(projectRegistry.setLastUsed).not.toHaveBeenCalled();
	});

	it('does not persist lastUsed for a not-found project', async () => {
		const { service, projectRegistry } = stubDeps({ projects: [] });

		const result = await service.loadBoard('unknown');

		expect(result.status).toBe('not-found');
		expect(projectRegistry.setLastUsed).not.toHaveBeenCalled();
	});
});
