import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketSyncManager } from './ticket-sync.js';
import { git } from '../infra/git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

// Create a bare remote repo and a clone to act as the worktree
async function createRepoWithRemote(): Promise<{ worktreeDir: string; remoteDir: string }> {
	const remoteDir = tmpDir('sync-remote-');
	await git(remoteDir, 'init', '--bare');

	const worktreeDir = tmpDir('sync-worktree-');
	await git(worktreeDir, 'init');
	await git(worktreeDir, 'config', 'user.email', 'test@test.com');
	await git(worktreeDir, 'config', 'user.name', 'Test');
	await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');
	await git(worktreeDir, 'remote', 'add', 'origin', remoteDir);
	await git(worktreeDir, 'push', '-u', 'origin', 'master');

	return { worktreeDir, remoteDir };
}

describe('TicketSyncManager', () => {
	const dirs: string[] = [];
	afterEach(() => { cleanup(...dirs); dirs.length = 0; });

	it('hasRemote returns false when no tracking branch', async () => {
		const dir = tmpDir('sync-noremote-');
		dirs.push(dir);
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new TicketSyncManager();
		expect(await manager.hasRemote(dir)).toBe(false);
	});

	it('hasRemote returns true when tracking branch exists', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = new TicketSyncManager();
		expect(await manager.hasRemote(worktreeDir)).toBe(true);
	});

	it('sync with no conflicts commits, rebases, and pushes successfully', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		// Create local changes
		fs.writeFileSync(path.join(worktreeDir, 'local.txt'), 'local content');

		const manager = new TicketSyncManager();
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

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result.status).toBe('success');

		const log = await git(worktreeDir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('sync: local changes');
		expect(lines[1]).toContain('init');
	});

	it('sync with nothing to do returns success', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('success');
	});

	it('sync that hits a conflict returns conflict status and abort restores state', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		// Create a second clone to push a conflicting change
		const clone2 = tmpDir('sync-clone2-');
		dirs.push(clone2);
		await git(clone2, 'clone', remoteDir, '.');
		await git(clone2, 'config', 'user.email', 'test@test.com');
		await git(clone2, 'config', 'user.name', 'Test');

		// Both sides modify the same file
		fs.writeFileSync(path.join(clone2, 'conflict.txt'), 'remote content');
		await git(clone2, 'add', '-A');
		await git(clone2, 'commit', '-m', 'remote change');
		await git(clone2, 'push');

		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('conflict');

		// Abort should restore the pre-rebase state
		await manager.abort(worktreeDir);

		// The local commit should still exist
		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).toContain('sync: local changes');

		// The file should have our local content
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it('hasRemote with non-existent directory throws instead of silently returning false', async () => {
		const manager = new TicketSyncManager();
		const bogusDir = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());

		await expect(manager.hasRemote(bogusDir)).rejects.toThrow();
	});

	it('hasRemote returns true during an active rebase', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		// Create a second clone to push a conflicting change
		const clone2 = tmpDir('sync-clone2-');
		dirs.push(clone2);
		await git(clone2, 'clone', remoteDir, '.');
		await git(clone2, 'config', 'user.email', 'test@test.com');
		await git(clone2, 'config', 'user.name', 'Test');

		// Both sides modify the same file to create a conflict
		fs.writeFileSync(path.join(clone2, 'conflict.txt'), 'remote content');
		await git(clone2, 'add', '-A');
		await git(clone2, 'commit', '-m', 'remote change');
		await git(clone2, 'push');

		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);
		expect(result.status).toBe('conflict');

		// Rebase is now in progress -- verify hasRemote still returns true
		expect(await manager.hasRemote(worktreeDir)).toBe(true);

		// Clean up the active rebase
		await manager.abort(worktreeDir);
	});

	it('sync surfaces a non-conflict rebase failure as error, not conflict', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		// Push a remote change so the local side is behind and a rebase is required.
		const clone2 = tmpDir('sync-clone2-');
		dirs.push(clone2);
		await git(clone2, 'clone', remoteDir, '.');
		await git(clone2, 'config', 'user.email', 'test@test.com');
		await git(clone2, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(clone2, 'remote.txt'), 'remote content');
		await git(clone2, 'add', '-A');
		await git(clone2, 'commit', '-m', 'remote change');
		await git(clone2, 'push');

		// Install a pre-rebase hook that refuses the rebase. This makes `git rebase`
		// fail for a non-conflict reason and leaves no in-progress rebase.
		const hooksDir = path.join(worktreeDir, '.git', 'hooks');
		const hookPath = path.join(hooksDir, 'pre-rebase');
		fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n');
		fs.chmodSync(hookPath, 0o755);

		// A local change so sync commits and then attempts to rebase.
		fs.writeFileSync(path.join(worktreeDir, 'local.txt'), 'local content');

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('error');
		// No phantom rebase should be left behind.
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
	});

});
