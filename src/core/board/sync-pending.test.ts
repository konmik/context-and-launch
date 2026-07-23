import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkHasPendingChanges, SyncPendingTracker } from './sync-pending.js';
import { git, gitSync, setGitOriginUrl } from '~/test-git.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { cloneFromTemplate, lazyTemplate } from '~/test-temp.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const getRepoTemplate = lazyTemplate(() => {
	const remoteDir = tmpDir('sync-pending-remote-template-');
	gitSync(remoteDir, 'init', '--bare', '-b', 'main');
	const dir = tmpDir('sync-pending-template-');
	gitSync(dir, 'init', '-b', 'main');
	fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
	gitSync(dir, 'add', '-A');
	gitSync(dir, 'commit', '-m', 'initial commit');
	gitSync(dir, 'remote', 'add', 'origin', remoteDir);
	gitSync(dir, 'push', '-u', 'origin', 'main');
	return { dir, remoteDir };
});

function createRepo(dirs: string[], withUpstream = true): string {
	const template = getRepoTemplate();
	const dir = cloneFromTemplate(template.dir, 'sync-pending-');
	dirs.push(dir);
	if (withUpstream) {
		const remoteDir = cloneFromTemplate(template.remoteDir, 'sync-pending-remote-');
		setGitOriginUrl(dir, remoteDir);
		dirs.push(remoteDir);
	} else {
		gitSync(dir, 'remote', 'remove', 'origin');
	}
	return dir;
}

describe('checkHasPendingChanges', () => {
	const dirs: string[] = [];
	const commands = createTestCommandTemplateService();

	afterAll(() => {
		for (const d of dirs) {
			try {
				fs.rmSync(d, { recursive: true, force: true });
			} catch {
				// temp dirs may already be deleted by the OS or a prior cleanup
			}
		}
		dirs.length = 0;
	});

	it.concurrent('returns false for a clean tree pushed to upstream', async () => {
		const dir = createRepo(dirs);

		expect(checkHasPendingChanges(dir, commands)).toBe(false);
	});

	it.concurrent('returns true when the tree has uncommitted changes', async () => {
		const dir = createRepo(dirs);
		fs.writeFileSync(path.join(dir, 'dirty.txt'), 'uncommitted');

		expect(checkHasPendingChanges(dir, commands)).toBe(true);
	});

	it.concurrent('returns true when a commit has not been pushed', async () => {
		const dir = createRepo(dirs);
		fs.writeFileSync(path.join(dir, 'new.txt'), 'content');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'unpushed');

		expect(checkHasPendingChanges(dir, commands)).toBe(true);
	});

	it.concurrent('returns false when unpushed commits net to zero against upstream', async () => {
		const dir = createRepo(dirs);

		fs.writeFileSync(path.join(dir, 'init.txt'), 'changed');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'change');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'revert');

		expect(checkHasPendingChanges(dir, commands)).toBe(false);
	});

	it.concurrent('returns true when no upstream is configured', async () => {
		const dir = createRepo(dirs, false);

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
