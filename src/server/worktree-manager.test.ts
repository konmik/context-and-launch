import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from './worktree-manager.js';
import { ConfigPaths } from './config-paths.js';
import { git } from './git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

async function cleanupWorktree(projectDir: string, wtPath: string) {
	try {
		await git(projectDir, 'worktree', 'remove', '--force', wtPath);
	} catch {
		// ignore
	}
}

describe('WorktreeManager', () => {
	const dirs: string[] = [];
	const worktreeCleanups: Array<[string, string]> = [];

	afterEach(async () => {
		for (const [proj, wt] of worktreeCleanups) {
			await cleanupWorktree(proj, wt);
		}
		worktreeCleanups.length = 0;
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('creates orphan branch and worktree in a fresh repo', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const worktreeDir = await manager.ensureWorktree(projectDir, 'test-slug');
		worktreeCleanups.push([projectDir, worktreeDir]);

		expect(fs.existsSync(worktreeDir)).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, '.git'))).toBe(true);

		const branches = await git(projectDir, 'branch', '--list', 'ai-stages');
		expect(branches).toContain('ai-stages');

		const files = fs.readdirSync(worktreeDir).filter((f) => !f.startsWith('.'));
		expect(files.length).toBe(0);
	});

	it('second call is idempotent', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const first = await manager.ensureWorktree(projectDir, 'test-slug');
		worktreeCleanups.push([projectDir, first]);
		const second = await manager.ensureWorktree(projectDir, 'test-slug');

		expect(first).toBe(second);
	});

	it('does not modify project working directory during worktree creation', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		fs.writeFileSync(path.join(projectDir, 'important.txt'), 'do not touch');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');

		const branchBefore = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const wt = await manager.ensureWorktree(projectDir, 'safe-slug');
		worktreeCleanups.push([projectDir, wt]);

		const branchAfter = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(branchAfter).toBe(branchBefore);
		expect(fs.readFileSync(path.join(projectDir, 'important.txt'), 'utf-8')).toBe(
			'do not touch'
		);
	});

	it('detached HEAD is not disrupted by worktree creation', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'first');
		const commitHash = (await git(projectDir, 'rev-parse', 'HEAD')).trim();
		await git(projectDir, 'checkout', '--detach');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const wt = await manager.ensureWorktree(projectDir, 'detach-slug');
		worktreeCleanups.push([projectDir, wt]);

		const currentBranch = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(currentBranch).toBe('HEAD');

		const currentCommit = (await git(projectDir, 'rev-parse', 'HEAD')).trim();
		expect(currentCommit).toBe(commitHash);
	});

	it('two slugs for same project create separate worktrees', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const [wtA, wtB] = await Promise.all([
			manager.ensureWorktree(projectDir, 'race-slug-a'),
			manager.ensureWorktree(projectDir, 'race-slug-b')
		]);
		worktreeCleanups.push([projectDir, wtA], [projectDir, wtB]);

		expect(fs.existsSync(wtA)).toBe(true);
		expect(fs.existsSync(wtB)).toBe(true);
		expect(fs.existsSync(path.join(wtA, '.git'))).toBe(true);
		expect(fs.existsSync(path.join(wtB, '.git'))).toBe(true);

		const branches = await git(projectDir, 'branch', '--list', 'ai-stages');
		expect(branches).toContain('ai-stages');
	});

	it('recovers stale worktree with removed gitdir target', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const worktreeDir = await manager.ensureWorktree(projectDir, 'stale-slug');
		worktreeCleanups.push([projectDir, worktreeDir]);
		expect(fs.existsSync(worktreeDir)).toBe(true);

		const dotGit = path.join(worktreeDir, '.git');
		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDirRel = content.replace(/^gitdir:\s*/, '');
		const gitDir = path.resolve(worktreeDir, gitDirRel);
		fs.rmSync(gitDir, { recursive: true, force: true });
		expect(fs.existsSync(gitDir)).toBe(false);

		const recreated = await manager.ensureWorktree(projectDir, 'stale-slug');
		expect(fs.existsSync(recreated)).toBe(true);
		const newDotGit = path.join(recreated, '.git');
		expect(fs.statSync(newDotGit).isFile()).toBe(true);
		const newContent = fs.readFileSync(newDotGit, 'utf-8').trim();
		const newGitDirRel = newContent.replace(/^gitdir:\s*/, '');
		const newGitDir = path.resolve(recreated, newGitDirRel);
		expect(fs.existsSync(newGitDir)).toBe(true);
	});

	it('git with non-zero exit code includes stderr in exception message', async () => {
		const projectDir = tmpDir('wt-stderr-');
		dirs.push(projectDir);

		await git(projectDir, 'init');

		await expect(git(projectDir, 'log')).rejects.toThrow(/does not have any commits/);
	});

	it('concurrent ensureWorktree with same slug and same project returns same directory', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const [a, b] = await Promise.all([
			manager.ensureWorktree(projectDir, 'concurrent-slug'),
			manager.ensureWorktree(projectDir, 'concurrent-slug')
		]);
		worktreeCleanups.push([projectDir, a]);

		expect(a).toBe(b);
		expect(fs.existsSync(a)).toBe(true);
		expect(fs.existsSync(path.join(a, '.git'))).toBe(true);
	});

	it('recovers from partial orphan branch creation failure', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const projectsDir = path.join(configDir, 'projects', 'partial-slug');
		const worktreeDir = path.join(projectsDir, 'tickets');

		// Simulate the orphan creation path partially completing: step 1
		// (git worktree add --orphan) succeeds but step 2 (git commit) fails.
		// The worktree directory is left behind with a valid .git file, but the
		// ai-stages branch is in "born" state (no commits). The per-slug branch
		// ai-stages--partial-slug was never created.
		fs.mkdirSync(projectsDir, { recursive: true });
		await git(projectDir, 'worktree', 'add', '--orphan', '-b', 'ai-stages', worktreeDir);
		// Do NOT commit -- this simulates the failure after step 1.

		// Remove the .git file so isValidWorktree returns false, forcing
		// the recovery path (rmSync + prune + re-create). The re-creation
		// must handle the ai-stages branch already existing in born state.
		const dotGit = path.join(worktreeDir, '.git');
		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDirRel = content.replace(/^gitdir:\s*/, '');
		const gitDir = path.resolve(worktreeDir, gitDirRel);
		fs.rmSync(gitDir, { recursive: true, force: true });

		// ensureWorktree should detect the invalid worktree, remove it,
		// prune stale entries, and re-create everything from scratch.
		const recovered = await manager.ensureWorktree(projectDir, 'partial-slug');
		worktreeCleanups.push([projectDir, recovered]);

		expect(fs.existsSync(recovered)).toBe(true);
		expect(fs.existsSync(path.join(recovered, '.git'))).toBe(true);

		// The worktree should be fully functional
		await git(recovered, 'commit', '--allow-empty', '-m', 'recovery commit');
	});

	it('recreates worktree when directory exists but .git file is missing', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const worktreeDir = await manager.ensureWorktree(projectDir, 'dotgit-missing');
		worktreeCleanups.push([projectDir, worktreeDir]);
		expect(fs.existsSync(path.join(worktreeDir, '.git'))).toBe(true);

		// Simulate manual deletion of the .git file only
		fs.unlinkSync(path.join(worktreeDir, '.git'));
		expect(fs.existsSync(path.join(worktreeDir, '.git'))).toBe(false);
		expect(fs.existsSync(worktreeDir)).toBe(true);

		// ensureWorktree should detect the invalid state, clean up, and recreate
		const recreated = await manager.ensureWorktree(projectDir, 'dotgit-missing');
		expect(fs.existsSync(recreated)).toBe(true);
		expect(fs.existsSync(path.join(recreated, '.git'))).toBe(true);

		// Verify the worktree is functional
		await git(recreated, 'commit', '--allow-empty', '-m', 'post-recovery commit');
	});

	it('handles missing project path', async () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		await expect(
			manager.ensureWorktree('/nonexistent/path/that/does/not/exist', 'bad-slug')
		).rejects.toThrow('Project path does not exist');
	});

	it('getWorktreeDir returns a path for an unregistered slug without error (pure path computation)', () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const slug = 'nonexistent-project';

		let result: string | undefined;
		expect(() => {
			result = manager.getWorktreeDir(slug);
		}).not.toThrow();

		expect(result).toBeDefined();
		expect(result).toContain(slug);
		// The directory is not guaranteed to exist -- this is by design
		expect(fs.existsSync(result!)).toBe(false);
	});

	it('getWorktreeDir rejects slugs containing path traversal', () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));

		// All of these slugs contain path traversal or separators and must be rejected
		const maliciousSlugs = [
			'../../tmp/evil',
			'..\\..\\tmp\\evil',
			'../sibling',
			'.',
			'..'
		];

		for (const slug of maliciousSlugs) {
			expect(
				() => manager.getWorktreeDir(slug),
				`slug "${slug}" should be rejected`
			).toThrow('Invalid slug');
		}

		// Valid slugs should work fine
		expect(() => manager.getWorktreeDir('my-project')).not.toThrow();
		expect(() => manager.getWorktreeDir('slug-123')).not.toThrow();
	});

	it('detects unusable worktree left by failed commit during orphan creation', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const projectsDir = path.join(configDir, 'projects', 'broken-slug');
		const worktreeDir = path.join(projectsDir, 'tickets');

		// Simulate: orphan branch creation succeeded but commit failed.
		// The worktree directory exists with a valid .git pointer, but the
		// branch 'ai-stages' is in "born" state (no commits).
		// This leaves the worktree on 'ai-stages' (wrong branch) instead of
		// 'ai-stages--broken-slug' (the correct per-slug branch).
		fs.mkdirSync(projectsDir, { recursive: true });
		await git(projectDir, 'worktree', 'add', '--orphan', '-b', 'ai-stages', worktreeDir);
		// Do NOT commit -- simulates the commit failure at line 62

		// Verify the .git pointer is valid (isValidWorktree would return true)
		const dotGit = path.join(worktreeDir, '.git');
		expect(fs.existsSync(dotGit)).toBe(true);
		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDirRel = content.replace(/^gitdir:\s*/, '');
		const gitDir = path.resolve(worktreeDir, gitDirRel);
		expect(fs.existsSync(gitDir)).toBe(true);

		// Now call ensureWorktree. It should NOT silently return the broken
		// worktree that is on the wrong branch with no commits.
		// It should detect the problem and repair/recreate.
		const result = await manager.ensureWorktree(projectDir, 'broken-slug');
		worktreeCleanups.push([projectDir, result]);

		expect(fs.existsSync(result)).toBe(true);
		expect(fs.existsSync(path.join(result, '.git'))).toBe(true);

		// The worktree must be on the correct per-slug branch
		const branch = (await git(result, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(branch).toBe('ai-stages--broken-slug');

		// The recovered worktree must be functional -- we can commit to it
		await git(result, 'commit', '--allow-empty', '-m', 'verify functional');
	});

	it('error propagates when git worktree prune fails during recovery of invalid worktree', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const worktreeDir = await manager.ensureWorktree(projectDir, 'prune-fail');
		worktreeCleanups.push([projectDir, worktreeDir]);

		// Break the worktree so isValidWorktree returns false:
		// Remove the .git file from the worktree directory
		const dotGit = path.join(worktreeDir, '.git');
		fs.unlinkSync(dotGit);
		expect(fs.existsSync(dotGit)).toBe(false);
		expect(fs.existsSync(worktreeDir)).toBe(true);

		// Now corrupt the project's .git/worktrees directory so that
		// 'git worktree prune' will fail. Replace the worktrees directory
		// with a file (git expects it to be a directory).
		const gitDir = path.join(projectDir, '.git');
		const worktreesGitDir = path.join(gitDir, 'worktrees');
		// Remove the existing worktrees directory
		fs.rmSync(worktreesGitDir, { recursive: true, force: true });
		// Create a file in its place to confuse git
		fs.writeFileSync(worktreesGitDir, 'corrupted');

		// ensureWorktree should propagate the error from prune, not swallow it.
		// The directory gets rmSync'd first (step 1 succeeds), then prune fails.
		await expect(
			manager.ensureWorktree(projectDir, 'prune-fail')
		).rejects.toThrow();

		// After the error, verify the worktree directory was already removed
		// (step 1 succeeded before step 2 failed). This confirms half-deleted
		// state -- but the error correctly propagated so the caller knows.
		expect(fs.existsSync(worktreeDir)).toBe(false);

		// Restore the worktrees dir so a retry could succeed (proving
		// the state is recoverable even though error propagated)
		fs.unlinkSync(worktreesGitDir);
		fs.mkdirSync(worktreesGitDir, { recursive: true });

		// Retry should now succeed since directory is gone and prune works
		const retried = await manager.ensureWorktree(projectDir, 'prune-fail');
		expect(fs.existsSync(retried)).toBe(true);
		expect(fs.existsSync(path.join(retried, '.git'))).toBe(true);
	});

	it('three sequential calls to same slug after first fails: lock chain does not deadlock', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		// projectDir exists but is NOT a git repo, so doEnsureWorktree will fail
		// when it tries to run `git branch --list`.
		const manager = new WorktreeManager(new ConfigPaths(configDir));

		const DEADLOCK_MS = 5000;

		// First call: should fail because projectDir is not a git repo
		const first = await Promise.race([
			manager.ensureWorktree(projectDir, 'deadlock-slug').then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(e: unknown) => ({ status: 'rejected' as const, reason: e })
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('DEADLOCK: first call timed out')), DEADLOCK_MS)
			)
		]);
		expect(first.status).toBe('rejected');

		// Now init git so subsequent calls can succeed
		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		// Second call: should succeed (not deadlock waiting on the failed first promise)
		const second = await Promise.race([
			manager.ensureWorktree(projectDir, 'deadlock-slug'),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('DEADLOCK: second call timed out')), DEADLOCK_MS)
			)
		]);
		expect(fs.existsSync(second)).toBe(true);
		worktreeCleanups.push([projectDir, second]);

		// Third call: should also succeed (idempotent)
		const third = await Promise.race([
			manager.ensureWorktree(projectDir, 'deadlock-slug'),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('DEADLOCK: third call timed out')), DEADLOCK_MS)
			)
		]);
		expect(third).toBe(second);
	});

	it('same slug from two different project paths races without corruption', async () => {
		const configDir = tmpDir('wt-config-');
		const projectA = tmpDir('wt-projectA-');
		const projectB = tmpDir('wt-projectB-');
		dirs.push(configDir, projectA, projectB);

		// Initialize two separate git repos
		await git(projectA, 'init');
		await git(projectA, 'commit', '--allow-empty', '-m', 'init A');
		await git(projectB, 'init');
		await git(projectB, 'commit', '--allow-empty', '-m', 'init B');

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const slug = 'colliding-slug';

		// Call ensureWorktree concurrently from two different projects with the same slug.
		// Since the lock is keyed by canonical project path, these get different locks
		// but target the same worktree directory. The code should either:
		// 1. Return successfully for both (with the same or different paths), OR
		// 2. Throw a clear error for at least one (not silent corruption)
		const results = await Promise.allSettled([
			manager.ensureWorktree(projectA, slug),
			manager.ensureWorktree(projectB, slug)
		]);

		const fulfilled = results.filter(
			(r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
		);
		const rejected = results.filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected'
		);

		// Either at least one succeeds, or all fail with clear errors.
		// Both outcomes are acceptable -- the key invariant is no silent corruption.
		if (fulfilled.length > 0) {
			// Any successful result must point to a valid worktree directory
			for (const r of fulfilled) {
				expect(fs.existsSync(r.value)).toBe(true);
				expect(fs.existsSync(path.join(r.value, '.git'))).toBe(true);
				worktreeCleanups.push([projectA, r.value]);
			}
		}

		// Any rejection must have a clear error message (not silent corruption)
		for (const r of rejected) {
			expect(r.reason).toBeInstanceOf(Error);
			expect((r.reason as Error).message.length).toBeGreaterThan(0);
		}
	});
});
