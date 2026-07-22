import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { git } from '~/test-git.js';
import { checkHasPendingChanges } from '../board/sync-pending.js';
import { setAppLogListener } from '../infra/app-logger.js';
import {
	tmpDir, cleanup, createRepoWithRemote, conflictResolveDir, pushRemoteConflict,
	createTicketSyncManager, createNoUpstreamRepoWithExistingRemoteBranch,
} from './sync-test-repos.js';

describe('TicketSyncManager', () => {
	const dirs: string[] = [];
	afterAll(() => { cleanup(...dirs); dirs.length = 0; });

	it.concurrent('hasRemote returns false when no remote is configured', async () => {
		const dir = tmpDir('sync-noremote-');
		dirs.push(dir);
		await git(dir, 'init');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(dir)).toBe(false);
	});

	it.concurrent('hasRemote returns true when remote exists but no tracking branch', async () => {
		const dir = tmpDir('sync-notrack-');
		dirs.push(dir);
		const remoteDir = tmpDir('sync-remote-notrack-');
		dirs.push(remoteDir);
		await git(remoteDir, 'init', '--bare');
		await git(dir, 'init');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');
		await git(dir, 'remote', 'add', 'origin', remoteDir);

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(dir)).toBe(true);
	});

	it.concurrent('hasRemote returns true when tracking branch exists', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		expect(await manager.hasRemote(worktreeDir)).toBe(true);
	});

	it.concurrent('sync with no conflicts commits, merges, and pushes successfully', async () => {
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

	it.concurrent('sync squashes multiple unpushed commits into one before pushing', async () => {
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

	it.concurrent('sync succeeds without pushing when unpushed commits net to zero against upstream', async () => {
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

	it.concurrent('sync with nothing to do returns success', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('success');
	});

	it.concurrent('sync that hits a conflict returns conflict and leaves the live tree untouched', async () => {
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

	it.concurrent('detectConflict ignores an orphaned resolution directory and checks Git state', async () => {
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

	it.concurrent('sync refuses to commit a working tree containing conflict markers', async () => {
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

	it.concurrent('sync with no upstream adopts remote history and preserves remote-only files', async () => {
		const { worktreeDir } = await createNoUpstreamRepoWithExistingRemoteBranch(dirs);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result.status).toBe('success');

		expect(fs.existsSync(path.join(worktreeDir, 'remote-only.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'local-only.txt'))).toBe(true);
		expect(fs.readFileSync(path.join(worktreeDir, 'remote-only.txt'), 'utf-8')).toBe('from remote');
		expect(fs.readFileSync(path.join(worktreeDir, 'local-only.txt'), 'utf-8')).toBe('from local');
	});

	it.concurrent('sync with no upstream against an existing remote branch pushes local changes and clears pending',
		async () => {
		const { worktreeDir, remoteDir } = await createNoUpstreamRepoWithExistingRemoteBranch(dirs);

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
		const { worktreeDir, remoteDir } = await createNoUpstreamRepoWithExistingRemoteBranch(dirs);

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

	it.concurrent('hasRemote with non-existent directory throws instead of silently returning false', async () => {
		const manager = createTicketSyncManager();
		const bogusDir = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());

		await expect(manager.hasRemote(bogusDir)).rejects.toThrow();
	});

	it.concurrent('hasRemote returns true during an active rebase', async () => {
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

	it.concurrent('abort is a no-op when no rebase is active', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = createTicketSyncManager();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
		await expect(manager.abort(worktreeDir)).resolves.toBeUndefined();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
	});
});
