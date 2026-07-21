import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketSyncManager } from './ticket-sync.js';
import { GitRepository } from '../infra/git-repository.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { git } from '~/test-git.js';
import { checkHasPendingChanges } from '../board/sync-pending.js';
import { setAppLogListener } from '../infra/app-logger.js';
import {
	tmpDir, cleanup, createRepoWithRemote, conflictResolveDir, pushRemoteConflict,
} from './sync-test-repos.js';

describe('TicketSyncManager', () => {
	const dirs: string[] = [];
	afterEach(() => { cleanup(...dirs); dirs.length = 0; });

	function createTicketSyncManager(): TicketSyncManager {
		const commands = createTestCommandTemplateService();
		return new TicketSyncManager(commands, new GitRepository(commands));
	}

	it('hasRemote returns false when no remote is configured', async () => {
		const dir = tmpDir('sync-noremote-');
		dirs.push(dir);
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(dir)).toBe(false);
	});

	it('hasRemote returns true when remote exists but no tracking branch', async () => {
		const dir = tmpDir('sync-notrack-');
		dirs.push(dir);
		const remoteDir = tmpDir('sync-remote-notrack-');
		dirs.push(remoteDir);
		await git(remoteDir, 'init', '--bare');
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');
		await git(dir, 'remote', 'add', 'origin', remoteDir);

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(dir)).toBe(true);
	});

	it('hasRemote returns true when tracking branch exists', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(worktreeDir)).toBe(true);
	});

	it('sync with no conflicts commits, merges, and pushes successfully', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		// Create local changes
		fs.writeFileSync(path.join(worktreeDir, 'local.txt'), 'local content');

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('success');

		// Verify the commit was pushed
		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).toContain('sync: local changes');

		// Working tree should be clean
		const status = await git(worktreeDir, 'status', '--porcelain');
		expect(status.trim()).toBe('');
	});

	it('sync squashes multiple unpushed commits into one before pushing', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(path.join(worktreeDir, 'a.txt'), 'a');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'auto: external changes');

		fs.writeFileSync(path.join(worktreeDir, 'b.txt'), 'b');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'auto: external changes');

		fs.writeFileSync(path.join(worktreeDir, 'c.txt'), 'c');

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result.status).toBe('success');

		const log = await git(worktreeDir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('sync: local changes');
		expect(lines[1]).toContain('init');
	});

	it('sync succeeds without pushing when unpushed commits net to zero against upstream', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const remoteHeadBefore = (await git(remoteDir, 'rev-parse', 'master')).trim();

		fs.writeFileSync(path.join(worktreeDir, 'flip.txt'), 'changed');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'auto: external changes');
		fs.unlinkSync(path.join(worktreeDir, 'flip.txt'));
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'auto: external changes');

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result).toEqual({ status: 'success' });
		expect((await git(remoteDir, 'rev-parse', 'master')).trim()).toBe(remoteHeadBefore);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(remoteHeadBefore);
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('sync with nothing to do returns success', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('success');
	});

	it('sync that hits a conflict returns conflict and leaves the live tree untouched', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const baseCommit = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('conflict');
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);

		const fileContent = fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8');
		expect(fileContent).toBe('local content');
		expect(fileContent).not.toContain('<<<<<<<');

		const parent = (await git(worktreeDir, 'rev-parse', 'HEAD^')).trim();
		expect(parent).toBe(baseCommit);

		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).toContain('sync: local changes');

		await expect(manager.abort(worktreeDir)).resolves.toBeUndefined();
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it('detectConflict ignores an orphaned resolution directory and checks Git state', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		const scratch = conflictResolveDir(worktreeDir);
		dirs.push(worktreeDir, remoteDir, scratch);

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'local change');
		await git(worktreeDir, 'fetch');
		fs.mkdirSync(scratch);

		const manager = createTicketSyncManager();

		expect(await manager.detectConflict(worktreeDir)).toBe(true);
	});

	it('sync refuses to commit a working tree containing conflict markers', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(
			path.join(worktreeDir, 'status.json'),
			'{\n<<<<<<< HEAD\n  "status": "done"\n=======\n  "status": "in-progress"\n>>>>>>> other\n}\n',
		);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('error');
		if (result.status === 'error') {
			expect(result.message).toMatch(/conflict marker/i);
		}

		// Nothing with conflict markers should have been committed.
		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).not.toContain('sync: local changes');
	});

	async function createNoUpstreamRepoWithExistingRemoteBranch(): Promise<{
		worktreeDir: string; remoteDir: string;
	}> {
		const remoteDir = tmpDir('sync-remote-orphan-');
		dirs.push(remoteDir);
		await git(remoteDir, 'init', '--bare');

		const seedDir = tmpDir('sync-seed-');
		dirs.push(seedDir);
		await git(seedDir, 'init');
		await git(seedDir, 'config', 'user.email', 'test@test.com');
		await git(seedDir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(seedDir, 'remote-only.txt'), 'from remote');
		fs.writeFileSync(path.join(seedDir, 'shared.txt'), 'shared');
		await git(seedDir, 'add', '-A');
		await git(seedDir, 'commit', '-m', 'seed');
		await git(seedDir, 'remote', 'add', 'origin', remoteDir);
		await git(seedDir, 'push', '-u', 'origin', 'master');

		const worktreeDir = tmpDir('sync-orphan-');
		dirs.push(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'config', 'user.email', 'test@test.com');
		await git(worktreeDir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(worktreeDir, 'shared.txt'), 'shared');
		fs.writeFileSync(path.join(worktreeDir, 'local-only.txt'), 'from local');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'local init');
		await git(worktreeDir, 'remote', 'add', 'origin', remoteDir);

		return { worktreeDir, remoteDir };
	}

	it('sync with no upstream adopts remote history and preserves remote-only files', async () => {
		const { worktreeDir } = await createNoUpstreamRepoWithExistingRemoteBranch();

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result.status).toBe('success');

		expect(fs.existsSync(path.join(worktreeDir, 'remote-only.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'local-only.txt'))).toBe(true);
		expect(fs.readFileSync(path.join(worktreeDir, 'remote-only.txt'), 'utf-8')).toBe('from remote');
		expect(fs.readFileSync(path.join(worktreeDir, 'local-only.txt'), 'utf-8')).toBe('from local');
	});

	it('sync with no upstream against an existing remote branch pushes local changes and clears pending', async () => {
		const { worktreeDir, remoteDir } = await createNoUpstreamRepoWithExistingRemoteBranch();

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result).toEqual({ status: 'success' });

		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
		const remoteHead = (await git(remoteDir, 'rev-parse', 'master')).trim();
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(remoteHead);
		expect(await git(remoteDir, 'show', 'master:local-only.txt')).toBe('from local');
		expect(await git(remoteDir, 'show', 'master:remote-only.txt')).toBe('from remote');
		expect(checkHasPendingChanges(worktreeDir, createTestCommandTemplateService())).toBe(false);
	});

	it('sync with no upstream preserves an edit written while the rejected push round-trips', async () => {
		const { worktreeDir, remoteDir } = await createNoUpstreamRepoWithExistingRemoteBranch();

		const manager = createTicketSyncManager();
		let injected = false;
		setAppLogListener((_cat, _msg, context) => {
			if (!injected && context?.commandTemplateKey === 'ticket-sync.fetch-origin') {
				injected = true;
				fs.writeFileSync(path.join(worktreeDir, 'local-only.txt'), 'concurrent edit');
			}
		});
		try {
			const result = await manager.sync(worktreeDir);
			expect(result.status).toBe('success');
		} finally {
			setAppLogListener(undefined);
		}

		expect(injected).toBe(true);
		expect(fs.readFileSync(path.join(worktreeDir, 'local-only.txt'), 'utf-8')).toBe('concurrent edit');
		expect(fs.readFileSync(path.join(worktreeDir, 'remote-only.txt'), 'utf-8')).toBe('from remote');

		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
		expect(await git(remoteDir, 'show', 'master:local-only.txt')).toBe('concurrent edit');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('hasRemote with non-existent directory throws instead of silently returning false', async () => {
		const manager = createTicketSyncManager();
		const bogusDir = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());

		await expect(manager.hasRemote(bogusDir)).rejects.toThrow();
	});

	it('hasRemote returns true during an active rebase', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'local change');
		await git(worktreeDir, 'fetch');

		const manager = createTicketSyncManager();
		await expect(git(worktreeDir, 'rebase', 'origin/master')).rejects.toThrow();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(true);

		expect(await manager.hasRemote(worktreeDir)).toBe(true);

		// Clean up the active rebase
		await manager.abort(worktreeDir);
	});

	it('abort is a no-op when no rebase is active', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
		await expect(manager.abort(worktreeDir)).resolves.toBeUndefined();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
	});

	it('prepareResolution rebases in a scratch worktree, never touching the live tree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		expect((await manager.sync(worktreeDir)).status).toBe('conflict');
		const liveHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();

		const plan = await manager.prepareResolution(worktreeDir);
		expect(plan.needsAgent).toBe(true);
		expect(plan.scratchDir).toBe(conflictResolveDir(worktreeDir));
		expect(manager.isResolving(worktreeDir)).toBe(true);

		// The rebase is in the scratch worktree; the live tree is untouched.
		expect(manager.hasActiveRebase(plan.scratchDir)).toBe(true);
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(liveHead);
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it('finalizeResolution advances the live tree to the pushed result and removes the scratch', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);

		// Simulate the agent resolving and pushing inside the scratch worktree.
		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');
		await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

		expect(await manager.finalizeResolution(worktreeDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);

		// Live tree now matches the pushed upstream, with the merged content.
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('merged content');
		const head = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		const upstream = (await git(worktreeDir, 'rev-parse', 'origin/master')).trim();
		expect(head).toBe(upstream);
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('finalizeResolution preserves a ticket edit made in the live tree during resolution', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);

		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');
		await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'edited during resolution');

		expect(await manager.finalizeResolution(worktreeDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);

		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('edited during resolution');
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('merged content');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('edited during resolution');

		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
	});

	it('isResolving reports false once the scratch rebase is resolved, even before the dir is removed', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);
		expect(manager.isResolving(worktreeDir)).toBe(true);

		// Agent resolves the rebase but the scratch worktree is not yet finalized/removed.
		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');

		expect(manager.hasActiveRebase(plan.scratchDir)).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);
	});

	it('sync returns conflict while a resolution is pending in the scratch worktree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		await manager.prepareResolution(worktreeDir);

		expect((await manager.sync(worktreeDir)).status).toBe('conflict');
	});

	it('abort removes the scratch worktree and leaves the live tree untouched', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const liveHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		const plan = await manager.prepareResolution(worktreeDir);

		await manager.abort(worktreeDir);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(manager.isResolving(worktreeDir)).toBe(false);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(liveHead);
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it('sync preserves a ticket edit written while the push is in flight', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v2');

		const worktreePosix = worktreeDir.replace(/\\/g, '/');
		const markerPosix = `${remoteDir.replace(/\\/g, '/')}/hook-ran`;
		const hookPath = path.join(remoteDir, 'hooks', 'pre-receive');
		fs.writeFileSync(
			hookPath,
			`#!/bin/sh\nprintf 'concurrent edit' > "${worktreePosix}/ticket.txt"\n`
			+ `printf 'yes' > "${markerPosix}"\nexit 0\n`,
		);
		fs.chmodSync(hookPath, 0o755);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(fs.existsSync(path.join(remoteDir, 'hook-ran'))).toBe(true);
		expect(result.status).toBe('success');
		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('concurrent edit');

		fs.rmSync(hookPath);
		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('concurrent edit');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('sync preserves a ticket edit landing right before the fast-forward to a moved upstream', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		await pushRemoteConflict(remoteDir, dirs);

		const manager = createTicketSyncManager();
		let injected = false;
		setAppLogListener((_cat, _msg, context) => {
			if (!injected && (
				context?.commandTemplateKey === 'ticket-sync.reset-hard'
				|| context?.commandTemplateKey === 'ticket-sync.fast-forward'
			)) {
				injected = true;
				fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'concurrent edit');
			}
		});
		try {
			const result = await manager.sync(worktreeDir);
			expect(result.status).toBe('success');
		} finally {
			setAppLogListener(undefined);
		}

		expect(injected).toBe(true);
		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('concurrent edit');
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('remote content');

		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('concurrent edit');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('prepareResolution pushes and finalizes without an agent when the rebase is clean', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		// Local commit and a non-conflicting remote commit on a different file.
		fs.writeFileSync(path.join(worktreeDir, 'local.txt'), 'local');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'sync: local changes');

		const clone2 = tmpDir('sync-clone2-');
		dirs.push(clone2);
		await git(clone2, 'clone', remoteDir, '.');
		await git(clone2, 'config', 'user.email', 'test@test.com');
		await git(clone2, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(clone2, 'remote.txt'), 'remote');
		await git(clone2, 'add', '-A');
		await git(clone2, 'commit', '-m', 'remote change');
		await git(clone2, 'push');

		const manager = createTicketSyncManager();
		const plan = await manager.prepareResolution(worktreeDir);

		expect(plan.needsAgent).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'local.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'remote.txt'))).toBe(true);
	});

});
