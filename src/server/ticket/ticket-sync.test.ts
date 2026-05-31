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
	await git(worktreeDir, 'config', 'core.editor', 'true');
	await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');
	await git(worktreeDir, 'remote', 'add', 'origin', remoteDir);
	await git(worktreeDir, 'push', '-u', 'origin', 'master');

	return { worktreeDir, remoteDir };
}

function conflictResolveDir(worktreeDir: string): string {
	return path.join(path.dirname(worktreeDir), `${path.basename(worktreeDir)}-conflict-resolve`);
}

// Push a conflicting change to `conflict.txt` on the remote via a second clone.
async function pushRemoteConflict(remoteDir: string, dirs: string[]): Promise<void> {
	const clone2 = tmpDir('sync-clone2-');
	dirs.push(clone2);
	await git(clone2, 'clone', remoteDir, '.');
	await git(clone2, 'config', 'user.email', 'test@test.com');
	await git(clone2, 'config', 'user.name', 'Test');
	fs.writeFileSync(path.join(clone2, 'conflict.txt'), 'remote content');
	await git(clone2, 'add', '-A');
	await git(clone2, 'commit', '-m', 'remote change');
	await git(clone2, 'push');
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

	it('sync with no conflicts commits, merges, and pushes successfully', async () => {
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

	it('sync that hits a conflict returns conflict and leaves the live tree untouched', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const baseCommit = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();

		const manager = new TicketSyncManager();
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

	it('sync refuses to commit a working tree containing conflict markers', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(
			path.join(worktreeDir, 'status.json'),
			'{\n<<<<<<< HEAD\n  "status": "done"\n=======\n  "status": "in-progress"\n>>>>>>> other\n}\n',
		);

		const manager = new TicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(result.status).toBe('error');
		if (result.status === 'error') {
			expect(result.message).toMatch(/conflict marker/i);
		}

		// Nothing with conflict markers should have been committed.
		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).not.toContain('sync: local changes');
	});

	it('hasRemote with non-existent directory throws instead of silently returning false', async () => {
		const manager = new TicketSyncManager();
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

		const manager = new TicketSyncManager();
		await expect(git(worktreeDir, 'rebase', 'origin/master')).rejects.toThrow();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(true);

		expect(await manager.hasRemote(worktreeDir)).toBe(true);

		// Clean up the active rebase
		await manager.abort(worktreeDir);
	});

	it('abort is a no-op when no rebase is active', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		const manager = new TicketSyncManager();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
		await expect(manager.abort(worktreeDir)).resolves.toBeUndefined();
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
	});

	it('prepareResolution rebases in a scratch worktree, never touching the live tree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = new TicketSyncManager();
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

		const manager = new TicketSyncManager();
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

	it('sync returns conflict while a resolution is pending in the scratch worktree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = new TicketSyncManager();
		await manager.sync(worktreeDir);
		await manager.prepareResolution(worktreeDir);

		expect((await manager.sync(worktreeDir)).status).toBe('conflict');
	});

	it('abort removes the scratch worktree and leaves the live tree untouched', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = new TicketSyncManager();
		await manager.sync(worktreeDir);
		const liveHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		const plan = await manager.prepareResolution(worktreeDir);

		await manager.abort(worktreeDir);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(manager.isResolving(worktreeDir)).toBe(false);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(liveHead);
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
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

		const manager = new TicketSyncManager();
		const plan = await manager.prepareResolution(worktreeDir);

		expect(plan.needsAgent).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'local.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'remote.txt'))).toBe(true);
	});

});
