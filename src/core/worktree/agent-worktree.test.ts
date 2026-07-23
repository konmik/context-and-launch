import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import * as gitModule from '~/test-git.js';
import { git } from '~/test-git.js';
import { makeWorktreeEnv, initGitRepo, tmpDir } from './agent-worktree.test-utils.js';

describe('AgentWorktreeManager', () => {
	const { dirs, setup, setupBehindRemote, cleanupAll } = makeWorktreeEnv();

	afterAll(cleanupAll);

	it.concurrent('creates worktree at the correct path with correct branch name', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = `${worktreeRoot}/st-0001-feature`;
			expect(result.worktreePath.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it.concurrent('truncates long ticket folder names for worktree path and branch', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const longName = 'wna-1533-opening-customer-support-from-login-error-alert'
			+ '-error-is-dimissed-after-opening-customer-support-page';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', longName);
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const folderName = path.basename(result.worktreePath);
			expect(folderName.length).toBeLessThanOrEqual(50);
			expect(longName.startsWith(folderName)).toBe(true);
			expect(fs.existsSync(result.worktreePath)).toBe(true);
			const branch = (await git(result.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
			expect(branch).toBe(folderName);
		}
	});

	it.concurrent('reuses existing worktree', async () => {
		const { projectDir, awm } = setup();
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result1).toBe(true);

		const result2 = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result2).toBe(true);
		if ('worktreePath' in result1 && 'worktreePath' in result2) {
			expect(result2.worktreePath).toBe(result1.worktreePath);
		}
	});

	it.concurrent('detects uncommitted changes and returns dirtyWorktree', async () => {
		const { projectDir, awm } = setup();
		// Create an uncommitted file
		fs.writeFileSync(path.join(projectDir, 'dirty.txt'), 'uncommitted');
		await git(projectDir, 'add', 'dirty.txt');

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect(result).toEqual({ dirtyWorktree: true });
	});

	it.concurrent('falls back from main to master', async () => {
		const { projectDir, awm } = setup('master');
		const mainBranch = await awm.getMainBranch(projectDir);
		expect(mainBranch).toBe('master');
	});

	it.concurrent('throws when neither main nor master exists', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		// Init with a different branch name
		await git(projectDir, 'init', '-b', 'develop');
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it.concurrent('uses default worktree path when worktreeRootPath is not configured', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = path.join(configDir, 'projects', 'my-proj', 'worktrees', 'st-0001');
			expect(path.resolve(result.worktreePath)).toBe(path.resolve(expected));
		}
	});

	it.skipIf(process.platform !== 'win32').concurrent('Windows backslash worktreeRootPath:'
		+ ' worktree created, existence check matches on re-call,'
		+ ' returned path uses mixed separators', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(configDir, projectDir, worktreeRoot);

		initGitRepo(projectDir);

		// Force backslash separators in the stored worktreeRootPath
		const backslashRoot = worktreeRoot.replace(/\//g, '\\');

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('bs-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: backslashRoot,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		const folderName = 'st-0002-backslash';

		// First call: creates the worktree
		const result1 = await awm.ensureAgentWorktree(projectDir, 'bs-proj', folderName);
		expect('worktreePath' in result1).toBe(true);
		if (!('worktreePath' in result1)) throw new Error('expected worktreePath');

		// worktreePath is built as `${backslashRoot}/${folderName}` -- mixed separators
		expect(result1.worktreePath).toBe(`${backslashRoot}/${folderName}`);
		// The worktree directory actually exists on disk
		expect(fs.existsSync(result1.worktreePath)).toBe(true);

		// Second call: existence check normalizes slashes and finds it
		const result2 = await awm.ensureAgentWorktree(projectDir, 'bs-proj', folderName);
		expect('worktreePath' in result2).toBe(true);
		if ('worktreePath' in result2) {
			expect(result2.worktreePath).toBe(result1.worktreePath);
		}
	});

	it.concurrent(
		're-adds worktree with existing branch after worktree removal (no -b, no "branch already exists")',
		async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const folderName = 'st-0003-readd';
		const worktreePath = path.join(worktreeRoot, folderName);

		// First call: creates worktree and branch st-0003-readd
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result1).toBe(true);
		expect(fs.existsSync(worktreePath)).toBe(true);

		// Branch exists
		const branchBefore = await git(projectDir, 'branch', '--list', 'st-0003-readd');
		expect(branchBefore.trim()).toBeTruthy();

		// Remove the worktree via git (branch stays)
		await git(projectDir, 'worktree', 'remove', worktreePath);
		expect(fs.existsSync(worktreePath)).toBe(false);

		// Branch still exists after worktree removal
		const branchAfter = await git(projectDir, 'branch', '--list', 'st-0003-readd');
		expect(branchAfter.trim()).toBeTruthy();

		// Second call: should re-add worktree using existing branch, not throw
		const result2 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result2).toBe(true);
		expect(fs.existsSync(worktreePath)).toBe(true);
	});

	it.concurrent('TOCTOU: config deleted between getMergedConfig guard and ensureAgentWorktree'
		+ ' falls back to default path', async () => {
		const { projectDir, lcm, awm, configDir, paths } = setup();

		// Step 1: Route guard reads merged config -- worktreeRootPath is present, guard passes
		const merged = lcm.getMergedConfig('my-proj');
		expect(merged.worktreeRootPath).toBeTruthy();

		// Step 2: Simulate race -- config file is deleted before ensureAgentWorktree runs
		const projectConfigDir = path.join(configDir, 'projects', 'my-proj', 'config');
		fs.rmSync(projectConfigDir, { recursive: true, force: true });

		// Step 3: ensureAgentWorktree does its own loadProjectConfig, which returns emptyConfig()
		// because the file no longer exists -- worktreeRootPath is undefined, falls back to default
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = paths.agentWorktreeDir('my-proj');
			expect(result.worktreePath.replace(/\\/g, '/')).toContain(expected.replace(/\\/g, '/'));
		}
	});

	it.concurrent('behind-remote proceeds with worktree creation and sets behindRemote flag', async () => {
		const { projectDir, awm } = await setupBehindRemote();

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0005-behind');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			expect(result.behindRemote).toBe(true);
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it('behind-remote check passes on feature branch while main is stale:'
		+ ' worktree created from outdated main without warning', async () => {
		const bareDir = tmpDir('awm-bare-');
		dirs.push(bareDir);
		await git(bareDir, 'init', '--bare', '-b', 'main');

		const projectDir = tmpDir('awm-stale-main-');
		dirs.push(projectDir);
		await git(os.tmpdir(), 'clone', bareDir, projectDir);
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');
		await git(projectDir, 'push', '-u', 'origin', 'main');

		// Create a feature branch and push it (user works here)
		await git(projectDir, 'checkout', '-b', 'feature');
		fs.writeFileSync(path.join(projectDir, 'feature.txt'), 'feature work');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feature commit');
		await git(projectDir, 'push', '-u', 'origin', 'feature');

		// Push a new commit to main from another clone (main becomes stale in projectDir)
		const pusherDir = tmpDir('awm-pusher-');
		dirs.push(pusherDir);
		await git(os.tmpdir(), 'clone', bareDir, pusherDir);
		fs.writeFileSync(path.join(pusherDir, 'new-on-main.txt'), 'newer content');
		await git(pusherDir, 'add', '.');
		await git(pusherDir, 'commit', '-m', 'newer main commit');
		await git(pusherDir, 'push');

		// Fetch so projectDir knows about new remote commits (feature branch is up-to-date, main is behind)
		await git(projectDir, 'fetch');

		const configDir = tmpDir('awm-config-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(configDir, worktreeRoot);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-stale-main');

		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			expect(result.behindRemote).toBe(true);
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it.concurrent(
		'reusing an existing worktree does not re-check main freshness (no behind-remote warning)', async () => {
		const { projectDir, awm } = await setupBehindRemote();

		// First call forks a new worktree from stale main -> warns once.
		const first = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0038-reuse');
		expect('worktreePath' in first).toBe(true);
		if ('worktreePath' in first) expect(first.behindRemote).toBe(true);

		// Second call reuses the existing worktree -> must not warn again.
		const second = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0038-reuse');
		expect('worktreePath' in second).toBe(true);
		if ('worktreePath' in second) expect(second.behindRemote).toBeUndefined();
	});

	it.concurrent(
		'reusing an existing branch does not re-check main freshness (no behind-remote warning)', async () => {
		const { projectDir, awm } = await setupBehindRemote();

		const first = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0038-branch');
		expect('worktreePath' in first).toBe(true);
		if (!('worktreePath' in first)) throw new Error('expected worktreePath');
		expect(first.behindRemote).toBe(true);

		// Remove the worktree but keep the branch.
		await git(projectDir, 'worktree', 'remove', first.worktreePath);

		// Re-adding from the existing branch does not fork from main -> must not warn.
		const second = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0038-branch');
		expect('worktreePath' in second).toBe(true);
		if ('worktreePath' in second) expect(second.behindRemote).toBeUndefined();
	});

	it.concurrent('getMainBranch does not falsely match a branch named main-v2 for the main check', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		// Init with branch named 'main-v2' -- no 'main' or 'master' exists
		await git(projectDir, 'init', '-b', 'main-v2');
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

		// git branch --list 'main' should NOT match 'main-v2'
		// so getMainBranch should throw since neither 'main' nor 'master' exists
		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it.concurrent('concurrent ensureAgentWorktree for same folderName: at least one succeeds,'
		+ ' the other succeeds or gets a clean error', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const folderName = 'st-concurrent-race';

		// Launch two calls concurrently before either completes
		const [r1, r2] = await Promise.allSettled([
			awm.ensureAgentWorktree(projectDir, 'my-proj', folderName),
			awm.ensureAgentWorktree(projectDir, 'my-proj', folderName),
		]);

		// At least one must succeed
		const successes = [r1, r2].filter(r => r.status === 'fulfilled');
		const failures = [r1, r2].filter(r => r.status === 'rejected');

		expect(successes.length).toBeGreaterThanOrEqual(1);

		// Every success must return a valid worktreePath
		for (const s of successes) {
			const result = (s as PromiseFulfilledResult<any>).value;
			expect('worktreePath' in result).toBe(true);
			if ('worktreePath' in result) {
				const expected = `${worktreeRoot}/${folderName}`;
				expect(result.worktreePath.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
			}
		}

		// Any failure must have a clean git error message (not corruption)
		for (const f of failures) {
			const err = (f as PromiseRejectedResult).reason;
			expect(err).toBeInstanceOf(Error);
			// Git's error for duplicate worktree add contains "already" or "checked out"
			expect(err.message).toMatch(/already|checked out|exists/i);
		}

		// The worktree directory must be valid at the end
		const worktreePath = path.join(worktreeRoot, folderName);
		expect(fs.existsSync(worktreePath)).toBe(true);
		// It should contain a .git file or directory (worktree marker)
		expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);
	});

	it('behind-remote catch swallows non-upstream errors:'
		+ ' generic rev-list failure logs warning and worktree creation proceeds', async () => {
		const { projectDir, worktreeRoot, awm } = setup();

		const originalGit = gitModule.git;
		const gitSpy = vi.spyOn(gitModule, 'git').mockImplementation(
			(workDir: string, ...args: string[]) => {
				if (args[0] === 'rev-list') {
					return Promise.reject(new Error('fatal: bad object HEAD'));
				}
				return originalGit(workDir, ...args);
			}
		);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0004-generic-err');
			// Worktree creation proceeds despite the rev-list error
			expect('worktreePath' in result).toBe(true);
			if ('worktreePath' in result) {
				const expected = `${worktreeRoot}/st-0004-generic-err`;
				expect(result.worktreePath.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
				expect(fs.existsSync(result.worktreePath)).toBe(true);
			}
			// Warning was logged with the generic error message
			expect(warnSpy).toHaveBeenCalledWith(
				'Skipping upstream check:',
				expect.any(String),
			);
		} finally {
			gitSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it.concurrent(
		'branch checked out in existing worktree at different path: returns error instead of data loss', async () => {
		const configDir = tmpDir('awm-config-dup-');
		const projectDir = tmpDir('awm-project-dup-');
		const worktreeRootA = tmpDir('awm-wt-A-');
		const worktreeRootB = tmpDir('awm-wt-B-');
		dirs.push(configDir, projectDir, worktreeRootA, worktreeRootB);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('dup-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRootA,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		const folderName = 'st-dup-branch';

		const result1 = await awm.ensureAgentWorktree(projectDir, 'dup-proj', folderName);
		expect('worktreePath' in result1).toBe(true);

		lcm.saveProjectConfig('dup-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRootB,
		});

		const error = await awm.ensureAgentWorktree(projectDir, 'dup-proj', folderName)
			.catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/already checked out/i);
		expect((error as Error).message).toContain('git worktree remove');

		if ('worktreePath' in result1) {
			expect(fs.existsSync(result1.worktreePath)).toBe(true);
		}
	});

	it.concurrent('stale worktree reference is pruned when old directory no longer exists', async () => {
		const configDir = tmpDir('awm-config-stale-');
		const projectDir = tmpDir('awm-project-stale-');
		const worktreeRootA = tmpDir('awm-wt-A-');
		const worktreeRootB = tmpDir('awm-wt-B-');
		dirs.push(configDir, projectDir, worktreeRootA, worktreeRootB);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('stale-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRootA,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		const folderName = 'st-stale-ref';

		const result1 = await awm.ensureAgentWorktree(projectDir, 'stale-proj', folderName);
		expect('worktreePath' in result1).toBe(true);

		if ('worktreePath' in result1) {
			fs.rmSync(result1.worktreePath, { recursive: true, force: true });
		}

		lcm.saveProjectConfig('stale-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRootB,
		});

		const result2 = await awm.ensureAgentWorktree(projectDir, 'stale-proj', folderName);
		expect('worktreePath' in result2).toBe(true);
		if ('worktreePath' in result2) {
			expect(fs.existsSync(result2.worktreePath)).toBe(true);
		}
	});

	it('rev-list returns non-numeric output: parseInt produces NaN,'
		+ ' NaN > 0 is false, silently skipping behind-remote check', async () => {
		const { projectDir, worktreeRoot, awm } = setup();

		const originalGit = gitModule.git;

		// Test both garbage text and empty string -- both produce NaN from parseInt
		for (const garbageOutput of ['abc\n', '', '   \n', 'not-a-number']) {
			const gitSpy = vi.spyOn(gitModule, 'git').mockImplementation(
				(workDir: string, ...args: string[]) => {
					if (args[0] === 'rev-list') {
						// Return garbage instead of throwing -- simulates malformed git output
						return Promise.resolve(garbageOutput);
					}
					return originalGit(workDir, ...args);
				}
			);

			try {
				// Verify the core hypothesis: parseInt of garbage is NaN
				expect(parseInt(garbageOutput.trim(), 10)).toBeNaN();
				// And NaN > 0 is false, so the behind-remote check is skipped
				expect(parseInt(garbageOutput.trim(), 10) > 0).toBe(false);

				const result = await awm.ensureAgentWorktree(
					projectDir, 'my-proj', `st-nan-${garbageOutput.trim() || 'empty'}`
				);
				// Worktree creation proceeds -- behind-remote check was silently skipped
				expect('worktreePath' in result).toBe(true);
				if ('worktreePath' in result) {
					expect(fs.existsSync(result.worktreePath)).toBe(true);
				}
			} finally {
				gitSpy.mockRestore();
			}
		}
	});

	it.concurrent('defaults to projects/{projectSlug}/worktrees/ when worktreeRootPath is not configured', async () => {
		const configDir = tmpDir('awm-config-pullretry-');
		const projectDir = tmpDir('awm-project-pullretry-');
		dirs.push(configDir, projectDir);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('no-wt-proj', {
			templates: [{ name: 'Default', text: 'Do the thing' }],
			skills: [],
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

		const config = lcm.loadProjectConfig('no-wt-proj');
		expect(config.worktreeRootPath).toBeUndefined();

		const result = await awm.ensureAgentWorktree(projectDir, 'no-wt-proj', 'st-0001-feature');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = path.join(configDir, 'projects', 'no-wt-proj', 'worktrees', 'st-0001-feature');
			expect(path.resolve(result.worktreePath)).toBe(path.resolve(expected));
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});
});
