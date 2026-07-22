import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { checkHasPendingChanges, SyncPendingTracker } from './sync-pending.js';
import { git } from '~/test-git.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function initRepo(dir: string): Promise<void> {
	await git(dir, 'init', '-b', 'main');
	fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
	await git(dir, 'add', '-A');
	await git(dir, 'commit', '-m', 'initial commit');
}

async function addUpstream(dir: string): Promise<string> {
	const remoteDir = dir + '-remote.git';
	execSync(`git init --bare -b main "${remoteDir}"`, { cwd: os.tmpdir() });
	await git(dir, 'remote', 'add', 'origin', remoteDir);
	await git(dir, 'push', '-u', 'origin', 'main');
	return remoteDir;
}

describe('checkHasPendingChanges', () => {
	const dirs: string[] = [];
	const commands = createTestCommandTemplateService();

	afterEach(() => {
		for (const d of dirs) {
			try {
				fs.rmSync(d, { recursive: true, force: true });
			} catch {
				// temp dirs may already be deleted by the OS or a prior cleanup
			}
		}
		dirs.length = 0;
	});

	it('returns false for a clean tree pushed to upstream', async () => {
		const dir = tmpDir('sync-pending-clean-');
		dirs.push(dir);
		await initRepo(dir);
		dirs.push(await addUpstream(dir));

		expect(checkHasPendingChanges(dir, commands)).toBe(false);
	});

	it('returns true when the tree has uncommitted changes', async () => {
		const dir = tmpDir('sync-pending-dirty-');
		dirs.push(dir);
		await initRepo(dir);
		dirs.push(await addUpstream(dir));
		fs.writeFileSync(path.join(dir, 'dirty.txt'), 'uncommitted');

		expect(checkHasPendingChanges(dir, commands)).toBe(true);
	});

	it('returns true when a commit has not been pushed', async () => {
		const dir = tmpDir('sync-pending-unpushed-');
		dirs.push(dir);
		await initRepo(dir);
		dirs.push(await addUpstream(dir));
		fs.writeFileSync(path.join(dir, 'new.txt'), 'content');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'unpushed');

		expect(checkHasPendingChanges(dir, commands)).toBe(true);
	});

	it('returns false when unpushed commits net to zero against upstream', async () => {
		const dir = tmpDir('sync-pending-netzero-');
		dirs.push(dir);
		await initRepo(dir);
		dirs.push(await addUpstream(dir));

		fs.writeFileSync(path.join(dir, 'init.txt'), 'changed');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'change');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'revert');

		expect(checkHasPendingChanges(dir, commands)).toBe(false);
	});

	it('returns true when no upstream is configured', async () => {
		const dir = tmpDir('sync-pending-noupstream-');
		dirs.push(dir);
		await initRepo(dir);

		expect(checkHasPendingChanges(dir, commands)).toBe(true);
	});
});

describe('SyncPendingTracker', () => {
	it('computes once and serves repeated reads from cache', () => {
		const check = vi.fn().mockReturnValue(true);
		const tracker = new SyncPendingTracker(check);

		expect(tracker.hasPendingChanges('/wt')).toBe(true);
		expect(tracker.hasPendingChanges('/wt')).toBe(true);
		expect(tracker.hasPendingChanges('/wt')).toBe(true);
		expect(check).toHaveBeenCalledTimes(1);
	});

	it('invalidate forces a recompute on the next read', () => {
		const check = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
		const tracker = new SyncPendingTracker(check);

		expect(tracker.hasPendingChanges('/wt')).toBe(true);
		tracker.invalidate('/wt');
		expect(tracker.hasPendingChanges('/wt')).toBe(false);
		expect(tracker.hasPendingChanges('/wt')).toBe(false);
		expect(check).toHaveBeenCalledTimes(2);
	});

	it('invalidate during a slow recompute does not pin the stale value', () => {
		const check = vi.fn().mockReturnValue(true);
		const tracker = new SyncPendingTracker(check);

		tracker.hasPendingChanges('/wt');
		tracker.invalidate('/wt');
		// Simulates a change arriving while the value above was being computed:
		// the cached entry carries the pre-invalidation version, so it must recompute.
		expect(tracker.hasPendingChanges('/wt')).toBe(true);
		expect(check).toHaveBeenCalledTimes(2);
	});

	it('tracks worktrees independently', () => {
		const check = vi.fn((worktreeDir: string) => worktreeDir === '/a');
		const tracker = new SyncPendingTracker(check);

		expect(tracker.hasPendingChanges('/a')).toBe(true);
		expect(tracker.hasPendingChanges('/b')).toBe(false);
		tracker.invalidate('/a');
		expect(tracker.hasPendingChanges('/b')).toBe(false);
		expect(check).toHaveBeenCalledTimes(2);
		expect(tracker.hasPendingChanges('/a')).toBe(true);
		expect(check).toHaveBeenCalledTimes(3);
	});
});
