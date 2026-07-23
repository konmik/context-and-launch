import { describe, it as baseIt, expect, vi, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';
import { ProjectPageService } from './project-page-service.js';
import { TicketSyncManager } from '~/core/ticket/ticket-sync.js';
import { git } from '~/test-git.js';
import { GitRepository } from '~/core/infra/git-repository.js';
import { createTestCommandTemplateService } from '~/core/command-template/command-template.test-utils.js';
import {
	cleanup, createRepoWithRemote, conflictResolveDir, pushRemoteConflict,
	tmpDir,
} from '~/core/ticket/sync-test-repos.js';
import type { ProjectRegistry, ProjectInfo } from '~/core/project/project-registry.js';
import type { BoardConfigManager } from '~/core/project/board-config.js';
import type { WorktreeManager } from '~/core/worktree/worktree-manager.js';
import type { LauncherConfigManager } from '~/core/launcher/launcher-config.js';
import type { FileWatcher } from '~/core/infra/file-watcher.js';
import { shardTestCases } from '~/test-shard.js';

function stubDeps(overrides: {
	projects?: ProjectInfo[];
	worktreeDir?: string;
	ticketSyncManager?: TicketSyncManager;
	agentWorktreeRoot?: string;
} = {}) {
	const projects: ProjectInfo[] = overrides.projects ?? [];

	const projectRegistry = {
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
	const fileWatcher = { watch: vi.fn() } as unknown as FileWatcher;
	const ticketSyncManager = overrides.ticketSyncManager ?? ({} as TicketSyncManager);
	const launcherConfigManager = {
		resolveWorktreeSettings: vi.fn(() => ({
			worktreeRootPath: overrides.agentWorktreeRoot ?? '/nonexistent-agent-worktree-root',
		})),
	} as unknown as LauncherConfigManager;

	const service = new ProjectPageService(
		projectRegistry,
		boardConfigManager,
		worktreeManager,
		fileWatcher,
		ticketSyncManager,
		launcherConfigManager,
	);

	return { service, projectRegistry, fileWatcher };
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

	const commands = createTestCommandTemplateService();
	const manager = new TicketSyncManager(commands, new GitRepository(commands));
	expect((await manager.sync(worktreeDir)).status).toBe('conflict');
	const plan = await manager.prepareResolution(worktreeDir);
	expect(plan.needsAgent).toBe(true);

	fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
	await git(plan.scratchDir, 'add', '-A');
	await git(plan.scratchDir, 'rebase', '--continue');

	return { worktreeDir, remoteDir, manager, plan };
}

export function registerProjectPageServiceTests(shard: number | readonly number[], total: number): void {
	const it = shardTestCases(baseIt, shard, total);

describe('ProjectPageService.loadProjectPage', () => {
	it('returns unavailable for a known-but-unavailable project', async () => {
		const { service } = stubDeps({
			projects: [
				{ path: '/deleted/path', projectSlug: 'gone', name: 'gone', available: false },
			],
		});

		const result = await service.loadProjectPage('gone');

		expect(result.status).toBe('unavailable');
	});

	it('returns not-found for a not-found project', async () => {
		const { service } = stubDeps({ projects: [] });

		const result = await service.loadProjectPage('unknown');

		expect(result.status).toBe('not-found');
	});

	describe('after the agent resolved a conflict in the scratch worktree', () => {
		const dirs: string[] = [];
		afterAll(() => { const done = cleanup(...dirs); dirs.length = 0; return done; });

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
			const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-fix-login');
			expect(ticket?.status).toBe('done');
			expect(result.board.ticketOrder['done']).toContain('st-0001-fix-login');
		});

		it('loads the restored board when scratch cleanup left an orphaned directory', async () => {
			const { worktreeDir, manager, plan } = await setupResolvedScratch(dirs);
			await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

			// Model Git for Windows partially completing `git worktree remove`: the
			// live tree was restored, then the scratch worktree was unregistered and
			// emptied, but its locked directory remained.
			await git(worktreeDir, 'reset', '--hard', 'origin/master');
			await git(worktreeDir, 'worktree', 'remove', plan.scratchDir);
			fs.mkdirSync(plan.scratchDir);

			const { service } = stubDeps({
				projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
				worktreeDir,
				ticketSyncManager: manager,
			});

			const result = await service.loadProjectPage('proj');

			expect(result.status).toBe('loaded');
			if (result.status !== 'loaded') return;
			const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-fix-login');
			expect(ticket?.status).toBe('done');
		});

		it.runIf(process.platform === 'win32')(
			'loads the restored board while the resolver still holds the scratch directory open',
			async () => {
				const { worktreeDir, manager, plan } = await setupResolvedScratch(dirs);
				await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

				const holder = spawn(
					process.execPath,
					['-e', "console.log('ready'); setInterval(() => {}, 1000)"],
					{ cwd: plan.scratchDir, stdio: ['ignore', 'pipe', 'ignore'] },
				);
				await new Promise<void>((resolve, reject) => {
					holder.once('error', reject);
					holder.stdout.once('data', () => resolve());
				});

				const { service } = stubDeps({
					projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
					worktreeDir,
					ticketSyncManager: manager,
				});

				try {
					const result = await service.loadProjectPage('proj');

					expect(result.status).toBe('loaded');
					if (result.status !== 'loaded') return;
					const ticket = result.board.tickets.find(
						t => t.folderName === 'st-0001-fix-login',
					);
					expect(ticket?.status).toBe('done');
				} finally {
					holder.kill();
					await new Promise<void>(resolve => holder.once('exit', () => resolve()));
				}
			},
		);

		it('loads the board without a conflict badge once resolved, even when the remote is unreachable', async () => {
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
				// The rebase is resolved, so there is no conflict to badge even though the
				// unreachable remote left the scratch worktree unfinalized on disk.
				expect((await service.loadSyncStatus('proj')).hasConflict).toBe(false);
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

	describe('hasAgentWorktree enrichment', () => {
		const dirs: string[] = [];
		afterEach(() => { const done = cleanup(...dirs); dirs.length = 0; return done; });

		function setupTicketDir(folderName: string, useWorktree: boolean) {
			const worktreeDir = tmpDir('pps-wt-');
			dirs.push(worktreeDir);
			const ticketDir = path.join(worktreeDir, folderName);
			fs.mkdirSync(ticketDir);
			fs.writeFileSync(path.join(ticketDir, 'status.json'), JSON.stringify({
				number: 'ST-0001', title: 'Feature', status: 'todo', useWorktree,
			}));
			return worktreeDir;
		}

		function simpleSyncManager() {
			return {
				finalizeResolution: vi.fn(),
				hasRemote: vi.fn(async () => false),
				detectConflict: vi.fn(async () => false),
			} as unknown as TicketSyncManager;
		}

		it('sets hasAgentWorktree true when the worktree folder exists on disk', async () => {
			const worktreeDir = setupTicketDir('st-0001-feature', false);
			const agentWorktreeRoot = tmpDir('pps-awt-');
			dirs.push(agentWorktreeRoot);
			fs.mkdirSync(path.join(agentWorktreeRoot, 'st-0001-feature'));

			const { service, fileWatcher } = stubDeps({
				projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
				worktreeDir,
				agentWorktreeRoot,
				ticketSyncManager: simpleSyncManager(),
			});

			const result = await service.loadProjectPage('proj');
			expect(result.status).toBe('loaded');
			if (result.status !== 'loaded') return;
			expect(fileWatcher.watch).toHaveBeenCalledWith(worktreeDir);
			const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-feature');
			expect(ticket?.hasAgentWorktree).toBe(true);
		});

		it('sets hasAgentWorktree false when no worktree folder exists', async () => {
			const worktreeDir = setupTicketDir('st-0001-feature', false);

			const { service } = stubDeps({
				projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
				worktreeDir,
				ticketSyncManager: simpleSyncManager(),
			});

			const result = await service.loadProjectPage('proj');
			expect(result.status).toBe('loaded');
			if (result.status !== 'loaded') return;
			const ticket = result.board.tickets.find(t => t.folderName === 'st-0001-feature');
			expect(ticket?.hasAgentWorktree).toBe(false);
		});
	});
});

describe('ProjectPageService.loadSyncStatus', () => {
	it('rejects when git state cannot be derived', async () => {
		const { service } = stubDeps({
			projects: [{ path: '/broken', projectSlug: 'proj', name: 'proj', available: true }],
		});

		await expect(service.loadSyncStatus('proj')).rejects.toThrow(
			'no worktreeDir configured in stub',
		);
	});

	it('waits for an in-flight page load of the same project before touching git state', async () => {
		const dirs: string[] = [];
		const worktreeDir = tmpDir('pps-serial-');
		dirs.push(worktreeDir);
		const ticketDir = path.join(worktreeDir, 'st-0001-fix-login');
		fs.mkdirSync(ticketDir);
		fs.writeFileSync(path.join(ticketDir, 'status.json'), statusJson('todo'));

		const events: string[] = [];
		let releaseFinalize!: () => void;
		const finalizeGate = new Promise<void>((resolve) => { releaseFinalize = resolve; });
		let finalizeStarted!: () => void;
		const finalizeStartedGate = new Promise<void>((resolve) => { finalizeStarted = resolve; });
		const ticketSyncManager = {
			finalizeResolution: vi.fn(async () => {
				finalizeStarted();
				await finalizeGate;
				events.push('finalize-end');
			}),
			hasRemote: vi.fn(async () => {
				events.push('hasRemote');
				return false;
			}),
			detectConflict: vi.fn(async () => false),
		} as unknown as TicketSyncManager;

		const { service } = stubDeps({
			projects: [{ path: worktreeDir, projectSlug: 'proj', name: 'proj', available: true }],
			worktreeDir,
			ticketSyncManager,
		});

		try {
			const pageLoad = service.loadProjectPage('proj');
			await finalizeStartedGate;
			const syncStatus = service.loadSyncStatus('proj');
			await new Promise((resolve) => setTimeout(resolve, 25));
			expect(events).toEqual([]);

			releaseFinalize();
			expect((await pageLoad).status).toBe('loaded');
			await syncStatus;
			expect(events).toEqual(['finalize-end', 'hasRemote']);
		} finally {
			await cleanup(...dirs);
		}
	});
});
}
