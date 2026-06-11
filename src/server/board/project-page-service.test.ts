import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ProjectPageService } from './project-page-service.js';
import { TicketSyncManager } from '~/server/ticket/ticket-sync.js';
import { git } from '~/server/infra/git.js';
import {
	cleanup, createRepoWithRemote, conflictResolveDir, pushRemoteConflict,
} from '~/server/ticket/sync-test-repos.js';
import type { ProjectRegistry, ProjectInfo } from '~/server/project/project-registry.js';
import type { BoardConfigManager } from '~/server/project/board-config.js';
import type { WorktreeManager } from '~/server/worktree/worktree-manager.js';
import type { FileWatcher } from '~/server/infra/file-watcher.js';

function stubDeps(overrides: {
	projects?: ProjectInfo[];
	worktreeDir?: string;
	ticketSyncManager?: TicketSyncManager;
} = {}) {
	const projects: ProjectInfo[] = overrides.projects ?? [];

	const projectRegistry = {
		setLastUsed: vi.fn(),
		listProjects: vi.fn(() => projects),
	} as unknown as ProjectRegistry;

	const boardConfigManager = {
		getConfig: vi.fn(() => ({
			columns: [{ name: 'todo' }, { name: 'in-progress' }, { name: 'done' }],
		})),
	} as unknown as BoardConfigManager;
	const worktreeManager = {
		ensureWorktree: vi.fn(async () => {
			if (!overrides.worktreeDir) throw new Error('no worktreeDir configured in stub');
			return overrides.worktreeDir;
		}),
	} as unknown as WorktreeManager;
	const fileWatcher = { watchOnly: vi.fn() } as unknown as FileWatcher;
	const ticketSyncManager = overrides.ticketSyncManager ?? ({} as TicketSyncManager);

	const service = new ProjectPageService(
		projectRegistry,
		boardConfigManager,
		worktreeManager,
		fileWatcher,
		ticketSyncManager,
	);

	return { service, projectRegistry };
}

const statusJson = (ticketStatus: string) => JSON.stringify({
	number: 'ST-0001',
	title: 'Fix login',
	status: ticketStatus,
	useWorktree: false,
	createdAt: '2026-01-01T00:00:00.000Z',
});

async function setupResolvedScratch(dirs: string[]) {
	const { worktreeDir, remoteDir } = await createRepoWithRemote();
	dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

	const ticketDir = path.join(worktreeDir, 'st-0001-fix-login');
	fs.mkdirSync(ticketDir);
	fs.writeFileSync(path.join(ticketDir, 'status.json'), statusJson('todo'));
	await git(worktreeDir, 'add', '-A');
	await git(worktreeDir, 'commit', '-m', 'add ticket');
	await git(worktreeDir, 'push');

	await pushRemoteConflict(remoteDir, dirs, {
		'st-0001-fix-login/status.json': statusJson('done'),
	});
	fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

	const manager = new TicketSyncManager();
	expect((await manager.sync(worktreeDir)).status).toBe('conflict');
	const plan = await manager.prepareResolution(worktreeDir);
	expect(plan.needsAgent).toBe(true);

	fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
	await git(plan.scratchDir, 'add', '-A');
	await git(plan.scratchDir, 'rebase', '--continue');

	return { worktreeDir, remoteDir, manager, plan };
}

describe('ProjectPageService.loadProjectPage', () => {
	it('does not persist lastUsed for a known-but-unavailable project', async () => {
		const { service, projectRegistry } = stubDeps({
			projects: [
				{ path: '/deleted/path', projectSlug: 'gone', name: 'gone', available: false },
			],
		});

		const result = await service.loadProjectPage('gone');

		expect(result.status).toBe('unavailable');
		expect(projectRegistry.setLastUsed).not.toHaveBeenCalled();
	});

	it('does not persist lastUsed for a not-found project', async () => {
		const { service, projectRegistry } = stubDeps({ projects: [] });

		const result = await service.loadProjectPage('unknown');

		expect(result.status).toBe('not-found');
		expect(projectRegistry.setLastUsed).not.toHaveBeenCalled();
	});

	describe('after the agent resolved a conflict in the scratch worktree', () => {
		const dirs: string[] = [];
		afterEach(() => { cleanup(...dirs); dirs.length = 0; });

		it('returns the post-resolution board on the first page load', async () => {
			const { worktreeDir, manager, plan } = await setupResolvedScratch(dirs);
			await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

			const { service } = stubDeps({
				projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
				worktreeDir,
				ticketSyncManager: manager,
			});

			const result = await service.loadProjectPage('proj');

			expect(result.status).toBe('loaded');
			if (result.status !== 'loaded') return;
			expect(result.hasConflict).toBe(false);
			const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-fix-login');
			expect(ticket?.status).toBe('done');
			expect(result.board.ticketOrder['done']).toContain('st-0001-fix-login');
		});

		it('still loads the board with the conflict badge when the remote is unreachable', async () => {
			const { worktreeDir, remoteDir, manager } = await setupResolvedScratch(dirs);
			await git(worktreeDir, 'remote', 'set-url', 'origin', `${remoteDir}-missing`);
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const { service } = stubDeps({
				projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
				worktreeDir,
				ticketSyncManager: manager,
			});

			try {
				const result = await service.loadProjectPage('proj');

				expect(result.status).toBe('loaded');
				if (result.status !== 'loaded') return;
				expect(result.hasConflict).toBe(true);
				const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-fix-login');
				expect(ticket?.status).toBe('todo');
				expect(warnSpy).toHaveBeenCalledWith(
					expect.stringContaining('Skipping conflict finalize check'),
					expect.anything(),
				);
			} finally {
				warnSpy.mockRestore();
			}
		});
	});
});
