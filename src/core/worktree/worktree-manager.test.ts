import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from './worktree-manager.js';
import { ConfigPaths } from '../config/config-paths.js';
import { git } from '~/test-git.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';

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

	afterAll(async () => {
		for (const [proj, wt] of worktreeCleanups) {
			await cleanupWorktree(proj, wt);
		}
		worktreeCleanups.length = 0;
		cleanup(...dirs);
		dirs.length = 0;
	});

	it.concurrent('creates orphan branch and worktree in a fresh repo', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'test-project');
		worktreeCleanups.push([projectDir, worktreeDir]);

		expect(fs.existsSync(worktreeDir)).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, '.git'))).toBe(true);

		const branches = await git(projectDir, 'branch', '--list', 'tickets');
		expect(branches).toContain('tickets');

		const files = fs.readdirSync(worktreeDir).filter((f) => !f.startsWith('.'));
		expect(files.length).toBe(0);
	});

	it.concurrent('uses a custom branch name when provided', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'custom-project', 'tickets');
		worktreeCleanups.push([projectDir, worktreeDir]);

		const branch = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(branch).toBe('tickets');
	});

	it.concurrent('creates the worktree at the resolver-provided tickets dir', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		const customParent = tmpDir('wt-tickets-');
		const customDir = path.join(customParent, 'tix');
		dirs.push(configDir, projectDir, customParent);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(
			new ConfigPaths(configDir), createTestCommandTemplateService(), () => customDir,
		);
		expect(manager.getWorktreeDir('any-project')).toBe(customDir);

		const worktreeDir = await manager.ensureWorktree(projectDir, 'any-project', 'tickets');
		worktreeCleanups.push([projectDir, worktreeDir]);
		expect(worktreeDir).toBe(customDir);
		expect(fs.existsSync(path.join(customDir, '.git'))).toBe(true);
		const head = (await git(customDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(head).toBe('tickets');
	});

	it.concurrent('adopts an existing remote branch matching the chosen name', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		const remoteDir = tmpDir('wt-remote-');
		dirs.push(configDir, projectDir, remoteDir);

		await git(remoteDir, 'init');
		await git(remoteDir, 'commit', '--allow-empty', '-m', 'init');
		await git(remoteDir, 'checkout', '--orphan', 'tickets');
		fs.writeFileSync(path.join(remoteDir, 'EXISTING.md'), 'from remote');
		await git(remoteDir, 'add', '.');
		await git(remoteDir, 'commit', '-m', 'seed tickets');

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');
		await git(projectDir, 'remote', 'add', 'origin', remoteDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'remote-project', 'tickets');
		worktreeCleanups.push([projectDir, worktreeDir]);

		const head = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(head).toBe('tickets');
		expect(fs.existsSync(path.join(worktreeDir, 'EXISTING.md'))).toBe(true);

		const upstream = (
			await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', 'tickets@{u}')
		).trim();
		expect(upstream).toBe('origin/tickets');
	});

	it.concurrent('falls back to a local orphan when the remote is unreachable', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');
		await git(projectDir, 'remote', 'add', 'origin', path.join(projectDir, 'does-not-exist'));

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'unreachable-project', 'tickets');
		worktreeCleanups.push([projectDir, worktreeDir]);

		const head = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(head).toBe('tickets');
	});

	it.concurrent('creates a new orphan branch when the remote lacks the chosen name', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		const remoteDir = tmpDir('wt-remote-');
		dirs.push(configDir, projectDir, remoteDir);

		await git(remoteDir, 'init');
		await git(remoteDir, 'commit', '--allow-empty', '-m', 'init');

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');
		await git(projectDir, 'remote', 'add', 'origin', remoteDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'no-remote-project', 'tickets');
		worktreeCleanups.push([projectDir, worktreeDir]);

		const head = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(head).toBe('tickets');
		const files = fs.readdirSync(worktreeDir).filter((f) => !f.startsWith('.'));
		expect(files.length).toBe(0);
	});

	it.concurrent('second call is idempotent', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const first = await manager.ensureWorktree(projectDir, 'test-project');
		worktreeCleanups.push([projectDir, first]);
		const second = await manager.ensureWorktree(projectDir, 'test-project');

		expect(first).toBe(second);
	});

	it.concurrent('does not modify project working directory during worktree creation', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		fs.writeFileSync(path.join(projectDir, 'important.txt'), 'do not touch');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');

		const branchBefore = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const wt = await manager.ensureWorktree(projectDir, 'safe-project');
		worktreeCleanups.push([projectDir, wt]);

		const branchAfter = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(branchAfter).toBe(branchBefore);
		expect(fs.readFileSync(path.join(projectDir, 'important.txt'), 'utf-8')).toBe(
			'do not touch'
		);
	});

	it.concurrent('detached HEAD is not disrupted by worktree creation', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'first');
		const commitHash = (await git(projectDir, 'rev-parse', 'HEAD')).trim();
		await git(projectDir, 'checkout', '--detach');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const wt = await manager.ensureWorktree(projectDir, 'detach-project');
		worktreeCleanups.push([projectDir, wt]);

		const currentBranch = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(currentBranch).toBe('HEAD');

		const currentCommit = (await git(projectDir, 'rev-parse', 'HEAD')).trim();
		expect(currentCommit).toBe(commitHash);
	});

	it.concurrent('errors when ticket branch is checked out at a different worktree location', async () => {
		const configDir = tmpDir('wt-config-');
		const staleConfigDir = tmpDir('wt-stale-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, staleConfigDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const staleManager = new WorktreeManager(new ConfigPaths(staleConfigDir), createTestCommandTemplateService());
		const staleWt = await staleManager.ensureWorktree(projectDir, 'ai-stages', 'tickets');
		worktreeCleanups.push([projectDir, staleWt]);
		expect(fs.existsSync(staleWt)).toBe(true);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		await expect(
			manager.ensureWorktree(projectDir, 'ai-stages', 'tickets')
		).rejects.toThrow(/already checked out at/);

		expect(fs.existsSync(staleWt)).toBe(true);
	});

	it.concurrent('errors when worktree directory exists but gitdir target is missing', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'stale-project');
		worktreeCleanups.push([projectDir, worktreeDir]);
		expect(fs.existsSync(worktreeDir)).toBe(true);

		const dotGit = path.join(worktreeDir, '.git');
		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDirRel = content.replace(/^gitdir:\s*/, '');
		const gitDir = path.resolve(worktreeDir, gitDirRel);
		fs.rmSync(gitDir, { recursive: true, force: true });

		await expect(
			manager.ensureWorktree(projectDir, 'stale-project')
		).rejects.toThrow(/invalid git metadata/);
		expect(fs.existsSync(worktreeDir)).toBe(true);
	});

	it.concurrent('git with non-zero exit code includes stderr in exception message', async () => {
		const projectDir = tmpDir('wt-stderr-');
		dirs.push(projectDir);

		await git(projectDir, 'init');

		await expect(git(projectDir, 'log')).rejects.toThrow(/does not have any commits/);
	});

	it.concurrent(
		'concurrent ensureWorktree with same projectSlug and same project returns same directory', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const [a, b] = await Promise.all([
			manager.ensureWorktree(projectDir, 'concurrent-project'),
			manager.ensureWorktree(projectDir, 'concurrent-project')
		]);
		worktreeCleanups.push([projectDir, a]);

		expect(a).toBe(b);
		expect(fs.existsSync(a)).toBe(true);
		expect(fs.existsSync(path.join(a, '.git'))).toBe(true);
	});

	it.concurrent('errors when partial orphan creation left invalid worktree directory', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const projectsDir = path.join(configDir, 'projects', 'partial-project');
		const worktreeDir = path.join(projectsDir, 'tickets');

		fs.mkdirSync(projectsDir, { recursive: true });
		await git(projectDir, 'worktree', 'add', '--orphan', '-b', 'tickets', worktreeDir);
		worktreeCleanups.push([projectDir, worktreeDir]);

		const dotGit = path.join(worktreeDir, '.git');
		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDirRel = content.replace(/^gitdir:\s*/, '');
		const gitDir = path.resolve(worktreeDir, gitDirRel);
		fs.rmSync(gitDir, { recursive: true, force: true });

		await expect(
			manager.ensureWorktree(projectDir, 'partial-project')
		).rejects.toThrow(/invalid git metadata/);
		expect(fs.existsSync(worktreeDir)).toBe(true);
	});

	it.concurrent('errors when worktree directory exists but .git file is missing', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'dotgit-missing-project');
		worktreeCleanups.push([projectDir, worktreeDir]);
		expect(fs.existsSync(path.join(worktreeDir, '.git'))).toBe(true);

		fs.unlinkSync(path.join(worktreeDir, '.git'));
		expect(fs.existsSync(worktreeDir)).toBe(true);

		await expect(
			manager.ensureWorktree(projectDir, 'dotgit-missing-project')
		).rejects.toThrow(/invalid git metadata/);
		expect(fs.existsSync(worktreeDir)).toBe(true);
	});

	it.concurrent('handles missing project path', async () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		await expect(
			manager.ensureWorktree('/nonexistent/path/that/does/not/exist', 'bad-project')
		).rejects.toThrow('Project path does not exist');
	});

	it.concurrent(
		'getWorktreeDir returns a path for an unregistered projectSlug without error (pure path computation)', () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const projectSlug = 'nonexistent-project';

		let result: string | undefined;
		expect(() => {
			result = manager.getWorktreeDir(projectSlug);
		}).not.toThrow();

		expect(result).toBeDefined();
		expect(result).toContain(projectSlug);
		// The directory is not guaranteed to exist -- this is by design
		expect(fs.existsSync(result!)).toBe(false);
	});

	it.concurrent('getWorktreeDir rejects projectSlugs containing path traversal', () => {
		const configDir = tmpDir('wt-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());

		// All of these projectSlugs contain path traversal or separators and must be rejected
		const maliciousProjectSlugs = [
			'../../tmp/evil',
			'..\\..\\tmp\\evil',
			'../sibling',
			'.',
			'..'
		];

		for (const projectSlug of maliciousProjectSlugs) {
			expect(
				() => manager.getWorktreeDir(projectSlug),
				`projectSlug "${projectSlug}" should be rejected`
			).toThrow('Invalid slug');
		}

		// Valid projectSlugs should work fine
		expect(() => manager.getWorktreeDir('my-project')).not.toThrow();
		expect(() => manager.getWorktreeDir('project-123')).not.toThrow();
	});

	it.concurrent('errors when worktree has valid .git but unresolvable HEAD (born branch)', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const projectsDir = path.join(configDir, 'projects', 'broken-project');
		const worktreeDir = path.join(projectsDir, 'tickets');

		fs.mkdirSync(projectsDir, { recursive: true });
		await git(projectDir, 'worktree', 'add', '--orphan', '-b', 'tickets', worktreeDir);
		worktreeCleanups.push([projectDir, worktreeDir]);

		await expect(
			manager.ensureWorktree(projectDir, 'broken-project')
		).rejects.toThrow(/invalid git metadata/);
		expect(fs.existsSync(worktreeDir)).toBe(true);
	});

	it.concurrent('preserves worktree directory when erroring on invalid metadata', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		await git(projectDir, 'init');
		await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const worktreeDir = await manager.ensureWorktree(projectDir, 'prune-fail-project');
		worktreeCleanups.push([projectDir, worktreeDir]);

		const dotGit = path.join(worktreeDir, '.git');
		fs.unlinkSync(dotGit);
		expect(fs.existsSync(worktreeDir)).toBe(true);

		await expect(
			manager.ensureWorktree(projectDir, 'prune-fail-project')
		).rejects.toThrow(/invalid git metadata/);

		expect(fs.existsSync(worktreeDir)).toBe(true);
	});

	it.concurrent(
		'three sequential calls to same projectSlug after first fails: lock chain does not deadlock', async () => {
		const configDir = tmpDir('wt-config-');
		const projectDir = tmpDir('wt-project-');
		dirs.push(configDir, projectDir);

		// projectDir exists but is NOT a git repo, so doEnsureWorktree will fail
		// when it tries to run `git branch --list`.
		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());

		const DEADLOCK_MS = 5000;

		// First call: should fail because projectDir is not a git repo
		const first = await Promise.race([
			manager.ensureWorktree(projectDir, 'deadlock-project').then(
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
			manager.ensureWorktree(projectDir, 'deadlock-project'),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('DEADLOCK: second call timed out')), DEADLOCK_MS)
			)
		]);
		expect(fs.existsSync(second)).toBe(true);
		worktreeCleanups.push([projectDir, second]);

		// Third call: should also succeed (idempotent)
		const third = await Promise.race([
			manager.ensureWorktree(projectDir, 'deadlock-project'),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('DEADLOCK: third call timed out')), DEADLOCK_MS)
			)
		]);
		expect(third).toBe(second);
	});

	it.concurrent('same projectSlug from two different project paths races without corruption', async () => {
		const configDir = tmpDir('wt-config-');
		const projectA = tmpDir('wt-projectA-');
		const projectB = tmpDir('wt-projectB-');
		dirs.push(configDir, projectA, projectB);

		// Initialize two separate git repos
		await git(projectA, 'init');
		await git(projectA, 'commit', '--allow-empty', '-m', 'init A');
		await git(projectB, 'init');
		await git(projectB, 'commit', '--allow-empty', '-m', 'init B');

		const manager = new WorktreeManager(new ConfigPaths(configDir), createTestCommandTemplateService());
		const projectSlug = 'colliding-project';

		// Call ensureWorktree concurrently from two different projects with the same projectSlug.
		// Since the lock is keyed by canonical project path, these get different locks
		// but target the same worktree directory. The code should either:
		// 1. Return successfully for both (with the same or different paths), OR
		// 2. Throw a clear error for at least one (not silent corruption)
		const results = await Promise.allSettled([
			manager.ensureWorktree(projectA, projectSlug),
			manager.ensureWorktree(projectB, projectSlug)
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
