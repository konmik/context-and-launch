import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import * as gitModule from '../infra/git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			// Prune worktrees before deleting to avoid git lock issues
			try { execSync('git worktree prune', { cwd: d, timeout: 5000 }); } catch { /* ok */ }
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
		}
	}
}

function initGitRepo(dir: string, branch = 'main'): void {
	execSync(`git init -b ${branch}`, { cwd: dir, timeout: 5000 });
	execSync('git config user.email "test@test.com"', { cwd: dir, timeout: 5000 });
	execSync('git config user.name "Test"', { cwd: dir, timeout: 5000 });
	fs.writeFileSync(path.join(dir, 'README.md'), '# test');
	execSync('git add .', { cwd: dir, timeout: 5000 });
	execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
}

describe('AgentWorktreeManager', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	function setup(branch = 'main') {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(configDir, projectDir, worktreeRoot);

		initGitRepo(projectDir, branch);

		const paths = new ConfigPaths(configDir);
		initializeDataDir(paths);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm);
		return { configDir, projectDir, worktreeRoot, lcm, awm, paths };
	}

	it('creates worktree at the correct path with correct branch name', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = `${worktreeRoot}/st-0001-feature`;
			expect(result.worktreePath.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it('truncates long ticket folder names for worktree path and branch', async () => {
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
			const branch = execSync('git rev-parse --abbrev-ref HEAD', {
				cwd: result.worktreePath, timeout: 5000,
			}).toString().trim();
			expect(branch).toBe(`ai/${folderName}`);
		}
	});

	it('reuses existing worktree', async () => {
		const { projectDir, awm } = setup();
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result1).toBe(true);

		const result2 = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect('worktreePath' in result2).toBe(true);
		if ('worktreePath' in result1 && 'worktreePath' in result2) {
			expect(result2.worktreePath).toBe(result1.worktreePath);
		}
	});

	it('detects uncommitted changes and returns dirtyWorktree', async () => {
		const { projectDir, awm } = setup();
		// Create an uncommitted file
		fs.writeFileSync(path.join(projectDir, 'dirty.txt'), 'uncommitted');
		execSync('git add dirty.txt', { cwd: projectDir });

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature');
		expect(result).toEqual({ dirtyWorktree: true });
	});

	it('falls back from main to master', async () => {
		const { projectDir, awm } = setup('master');
		const mainBranch = await awm.getMainBranch(projectDir);
		expect(mainBranch).toBe('master');
	});

	it('throws when neither main nor master exists', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		// Init with a different branch name
		execSync('git init -b develop', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: projectDir, timeout: 5000 });

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm);

		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it('uses default worktree path when worktreeRootPath is not configured', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm);

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = path.join(configDir, 'projects', 'my-proj', 'worktrees', 'st-0001');
			expect(path.resolve(result.worktreePath)).toBe(path.resolve(expected));
		}
	});

	it.skipIf(process.platform !== 'win32')('Windows backslash worktreeRootPath:'
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

		const awm = new AgentWorktreeManager(lcm);
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

	it('re-adds worktree with existing branch after worktree removal (no -b, no "branch already exists")', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const folderName = 'st-0003-readd';
		const worktreePath = path.join(worktreeRoot, folderName);

		// First call: creates worktree and branch ai/st-0003-readd
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result1).toBe(true);
		expect(fs.existsSync(worktreePath)).toBe(true);

		// Branch exists
		const branchBefore = execSync(
			'git branch --list ai/st-0003-readd', { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchBefore.trim()).toBeTruthy();

		// Remove the worktree via git (branch stays)
		execSync(
			`git worktree remove "${worktreePath}"`, { cwd: projectDir, timeout: 5000 },
		);
		expect(fs.existsSync(worktreePath)).toBe(false);

		// Branch still exists after worktree removal
		const branchAfter = execSync(
			'git branch --list ai/st-0003-readd', { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchAfter.trim()).toBeTruthy();

		// Second call: should re-add worktree using existing branch, not throw
		const result2 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result2).toBe(true);
		expect(fs.existsSync(worktreePath)).toBe(true);
	});

	it('TOCTOU: config deleted between getMergedConfig guard and ensureAgentWorktree'
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

	it('behind-remote proceeds with worktree creation and sets behindRemote flag', async () => {
		const bareDir = tmpDir('awm-bare-');
		dirs.push(bareDir);
		execSync('git init --bare -b main', { cwd: bareDir, timeout: 5000 });

		const projectDir = tmpDir('awm-behind-');
		dirs.push(projectDir);
		execSync(`git clone "${bareDir}" "${projectDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin main', { cwd: projectDir, timeout: 5000 });

		const pusherDir = tmpDir('awm-pusher-');
		dirs.push(pusherDir);
		execSync(`git clone "${bareDir}" "${pusherDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: pusherDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: pusherDir, timeout: 5000 });
		fs.writeFileSync(path.join(pusherDir, 'ahead.txt'), 'ahead');
		execSync('git add .', { cwd: pusherDir, timeout: 5000 });
		execSync('git commit -m "ahead commit"', { cwd: pusherDir, timeout: 5000 });
		execSync('git push', { cwd: pusherDir, timeout: 5000 });

		execSync('git fetch', { cwd: projectDir, timeout: 5000 });

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

		const awm = new AgentWorktreeManager(lcm);

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
		execSync('git init --bare -b main', { cwd: bareDir, timeout: 5000 });

		const projectDir = tmpDir('awm-stale-main-');
		dirs.push(projectDir);
		execSync(`git clone "${bareDir}" "${projectDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin main', { cwd: projectDir, timeout: 5000 });

		// Create a feature branch and push it (user works here)
		execSync('git checkout -b feature', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feature.txt'), 'feature work');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feature commit"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin feature', { cwd: projectDir, timeout: 5000 });

		// Push a new commit to main from another clone (main becomes stale in projectDir)
		const pusherDir = tmpDir('awm-pusher-');
		dirs.push(pusherDir);
		execSync(`git clone "${bareDir}" "${pusherDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: pusherDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: pusherDir, timeout: 5000 });
		fs.writeFileSync(path.join(pusherDir, 'new-on-main.txt'), 'newer content');
		execSync('git add .', { cwd: pusherDir, timeout: 5000 });
		execSync('git commit -m "newer main commit"', { cwd: pusherDir, timeout: 5000 });
		execSync('git push', { cwd: pusherDir, timeout: 5000 });

		// Fetch so projectDir knows about new remote commits (feature branch is up-to-date, main is behind)
		execSync('git fetch', { cwd: projectDir, timeout: 5000 });

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

		const awm = new AgentWorktreeManager(lcm);
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-stale-main');

		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			expect(result.behindRemote).toBe(true);
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it('getMainBranch does not falsely match a branch named main-v2 for the main check', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		// Init with branch named 'main-v2' -- no 'main' or 'master' exists
		execSync('git init -b main-v2', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: projectDir, timeout: 5000 });

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm);

		// git branch --list 'main' should NOT match 'main-v2'
		// so getMainBranch should throw since neither 'main' nor 'master' exists
		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it('concurrent ensureAgentWorktree for same folderName: at least one succeeds,'
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
				'fatal: bad object HEAD'
			);
		} finally {
			gitSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it('branch checked out in existing worktree at different path: returns error instead of data loss', async () => {
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

		const awm = new AgentWorktreeManager(lcm);
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

	it('stale worktree reference is pruned when old directory no longer exists', async () => {
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

		const awm = new AgentWorktreeManager(lcm);
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

	it('defaults to projects/{projectSlug}/worktrees/ when worktreeRootPath is not configured', async () => {
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

		const awm = new AgentWorktreeManager(lcm);

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

	it('isWorktreeClean returns true for clean worktree', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-clean-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const clean = await awm.isWorktreeClean(result.worktreePath);
			expect(clean).toBe(true);
		}
	});

	it('isWorktreeClean returns false for dirty worktree', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-dirty-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			fs.writeFileSync(path.join(result.worktreePath, 'dirty.txt'), 'dirty');
			const clean = await awm.isWorktreeClean(result.worktreePath);
			expect(clean).toBe(false);
		}
	});

	it('removeWorktree removes the worktree directory', async () => {
		const { projectDir, worktreeRoot, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-remove-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			await awm.removeWorktree(projectDir, result.worktreePath);
			expect(fs.existsSync(result.worktreePath)).toBe(false);
		}
	});

	it('deleteLocalBranch removes the branch', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-delbranch');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			await awm.removeWorktree(projectDir, result.worktreePath);
			await awm.deleteLocalBranch(projectDir, 'ai/st-delbranch');
			const branchList = execSync(
				'git branch --list ai/st-delbranch', { cwd: projectDir, timeout: 5000 },
			).toString();
			expect(branchList.trim()).toBe('');
		}
	});

	it('deleteLocalBranch succeeds when HEAD is not on mainBranch but branch is merged into main', async () => {
		const { projectDir, worktreeRoot, awm } = setup();

		execSync('git checkout -b other-branch', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'other.txt'), 'diverged work');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "diverge from main"', { cwd: projectDir, timeout: 5000 });
		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });

		execSync('git checkout -b ai/st-merged-feat', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature work');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feature commit"', { cwd: projectDir, timeout: 5000 });
		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });
		execSync('git merge ai/st-merged-feat', { cwd: projectDir, timeout: 5000 });

		const merged = await awm.isBranchMerged(projectDir, 'ai/st-merged-feat');
		expect(merged).toBe(true);

		execSync('git checkout other-branch', { cwd: projectDir, timeout: 5000 });
		const head = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, timeout: 5000 }).toString().trim();
		expect(head).toBe('other-branch');

		await awm.deleteLocalBranch(projectDir, 'ai/st-merged-feat');

		const branchList = execSync(
			'git branch --list ai/st-merged-feat', { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBe('');
	});

	it('ensureAgentWorktree with configuredBranch "develop" succeeds in repo with only develop branch', async () => {
		const { projectDir, worktreeRoot, awm } = setup('develop');
		const result = await awm.ensureAgentWorktree(
			projectDir, 'my-proj', 'st-develop-test', undefined, 'develop',
		);
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = `${worktreeRoot}/st-develop-test`;
			expect(result.worktreePath.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
			expect(fs.existsSync(result.worktreePath)).toBe(true);
		}
	});

	it('isBranchMerged detects squash-merged branch', async () => {
		const { projectDir, awm } = setup();

		execSync('git checkout -b ai/st-squash-feat', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feat1.txt'), 'part 1');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feat part 1"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feat2.txt'), 'part 2');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feat part 2"', { cwd: projectDir, timeout: 5000 });

		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });
		execSync('git merge --squash ai/st-squash-feat', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "squash: feat"', { cwd: projectDir, timeout: 5000 });

		const merged = await awm.isBranchMerged(projectDir, 'ai/st-squash-feat');
		expect(merged).toBe(true);
	});

	it('isBranchMerged detects squash-merged branch when main has moved forward', async () => {
		const { projectDir, awm } = setup();

		execSync('git checkout -b ai/st-squash-moved', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feature commit"', { cwd: projectDir, timeout: 5000 });

		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });
		execSync('git merge --squash ai/st-squash-moved', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "squash: feature"', { cwd: projectDir, timeout: 5000 });

		fs.writeFileSync(path.join(projectDir, 'other.txt'), 'later work');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "more work on main"', { cwd: projectDir, timeout: 5000 });

		const merged = await awm.isBranchMerged(projectDir, 'ai/st-squash-moved');
		expect(merged).toBe(true);
	});

	it('isBranchMerged detects squash-merged branch on remote when local main is behind', async () => {
		const remoteDir = tmpDir('awm-remote-');
		dirs.push(remoteDir);
		initGitRepo(remoteDir);
		execSync(`git clone "${remoteDir}" cloned`, { cwd: os.tmpdir(), timeout: 5000 });
		const projectDir = path.join(os.tmpdir(), 'cloned');
		dirs.push(projectDir);
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });

		execSync('git checkout -b ai/st-remote-squash', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feature"', { cwd: projectDir, timeout: 5000 });
		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });

		execSync('git checkout main', { cwd: remoteDir, timeout: 5000 });
		execSync(`git fetch "${projectDir}" ai/st-remote-squash`, { cwd: remoteDir, timeout: 5000 });
		execSync('git merge --squash FETCH_HEAD', { cwd: remoteDir, timeout: 5000 });
		execSync('git commit -m "squash: feature"', { cwd: remoteDir, timeout: 5000 });

		const configDir = tmpDir('awm-config-rsq-');
		dirs.push(configDir);
		const paths = new ConfigPaths(configDir);
		initializeDataDir(paths);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', { templates: [], skills: [], worktreeRootPath: tmpDir('awm-wt-rsq-') });
		const awm = new AgentWorktreeManager(lcm);

		const merged = await awm.isBranchMerged(projectDir, 'ai/st-remote-squash');
		expect(merged).toBe(true);
	});

	it('isBranchMerged returns false for unmerged branch', async () => {
		const { projectDir, awm } = setup();

		execSync('git checkout -b ai/st-unmerged', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'unmerged.txt'), 'not merged');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "unmerged work"', { cwd: projectDir, timeout: 5000 });
		execSync('git checkout main', { cwd: projectDir, timeout: 5000 });

		const merged = await awm.isBranchMerged(projectDir, 'ai/st-unmerged');
		expect(merged).toBe(false);
	});

	it('isBranchMerged with configuredBranch "develop" succeeds in repo with only develop branch', async () => {
		const { projectDir, awm } = setup('develop');
		const result = await awm.ensureAgentWorktree(
			projectDir, 'my-proj', 'st-merged-develop', undefined, 'develop',
		);
		expect('worktreePath' in result).toBe(true);
		const merged = await awm.isBranchMerged(projectDir, 'ai/st-merged-develop', 'develop');
		expect(merged).toBe(true);
	});

	it('worktreeRootPath directory does not exist on disk: git worktree add creates it automatically', async () => {
		const configDir = tmpDir('awm-config-nodir-');
		const projectDir = tmpDir('awm-project-nodir-');
		dirs.push(configDir, projectDir);

		initGitRepo(projectDir);

		// Point worktreeRootPath to a directory that does not exist on disk
		const nonexistentRoot = path.join(os.tmpdir(), 'awm-nonexistent-' + Date.now());
		// Do NOT create this directory -- that's the whole point of the test
		dirs.push(nonexistentRoot); // ensure cleanup

		expect(fs.existsSync(nonexistentRoot)).toBe(false);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('nodir-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: nonexistentRoot,
		});

		const awm = new AgentWorktreeManager(lcm);

		// Discovery: git worktree add creates intermediate directories automatically.
		// A nonexistent worktreeRootPath does NOT cause an error -- git silently
		// creates the parent directory and the worktree inside it.
		const result = await awm.ensureAgentWorktree(projectDir, 'nodir-proj', 'st-nodir-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			expect(fs.existsSync(result.worktreePath)).toBe(true);
			// The parent directory (nonexistentRoot) was created by git
			expect(fs.existsSync(nonexistentRoot)).toBe(true);
		}
	});

	it('isWorktreeBusy returns false for an unoccupied directory', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-busy-free');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const busy = await awm.isWorktreeBusy(result.worktreePath);
			expect(busy).toBe(false);
		}
	});

	it('isWorktreeBusy returns false for a nonexistent path', async () => {
		const { awm } = setup();
		const busy = await awm.isWorktreeBusy(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
		expect(busy).toBe(false);
	});

	it('isWorktreeBusy returns true when a process occupies the directory', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-busy-occupied');
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		const child: ChildProcess = spawn(
			process.execPath,
			['-e', 'setTimeout(() => {}, 60000)'],
			{ cwd: result.worktreePath, stdio: 'pipe' }
		);

		try {
			await new Promise(r => setTimeout(r, 200));
			const busy = await awm.isWorktreeBusy(result.worktreePath);
			expect(busy).toBe(true);
		} finally {
			child.kill();
		}
	});
});
