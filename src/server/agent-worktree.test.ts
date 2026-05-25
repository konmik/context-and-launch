import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from './launcher-config.js';
import { ConfigPaths } from './config-paths.js';
import * as gitModule from './git.js';

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
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, paths);
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

	it('detects uncommitted changes and throws', async () => {
		const { projectDir, awm } = setup();
		// Create an uncommitted file
		fs.writeFileSync(path.join(projectDir, 'dirty.txt'), 'uncommitted');
		execSync('git add dirty.txt', { cwd: projectDir });

		await expect(awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001-feature'))
			.rejects.toThrow('uncommitted changes');
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
		const awm = new AgentWorktreeManager(lcm, paths);

		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it('uses default worktree path when worktreeRootPath is not configured', async () => {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		dirs.push(configDir, projectDir);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm, paths);

		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0001');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const expected = path.join(configDir, 'projects', 'my-proj', 'worktrees', 'st-0001');
			expect(path.resolve(result.worktreePath)).toBe(path.resolve(expected));
		}
	});

	it('Windows backslash worktreeRootPath: worktree created, existence check matches on re-call, returned path uses mixed separators', async () => {
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

		const awm = new AgentWorktreeManager(lcm, paths);
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
		const branchBefore = execSync('git branch --list ai/st-0003-readd', { cwd: projectDir, timeout: 5000 }).toString();
		expect(branchBefore.trim()).toBeTruthy();

		// Remove the worktree via git (branch stays)
		execSync(`git worktree remove "${worktreePath}"`, { cwd: projectDir, timeout: 5000 });
		expect(fs.existsSync(worktreePath)).toBe(false);

		// Branch still exists after worktree removal
		const branchAfter = execSync('git branch --list ai/st-0003-readd', { cwd: projectDir, timeout: 5000 }).toString();
		expect(branchAfter.trim()).toBeTruthy();

		// Second call: should re-add worktree using existing branch, not throw
		const result2 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result2).toBe(true);
		expect(fs.existsSync(worktreePath)).toBe(true);
	});

	it('TOCTOU: config deleted between getMergedConfig guard and ensureAgentWorktree falls back to default path', async () => {
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

	it('behind-remote returns early when upstream is ahead without attempting worktree creation', async () => {
		// 1. Create a bare repo as the "remote"
		const bareDir = tmpDir('awm-bare-');
		dirs.push(bareDir);
		execSync('git init --bare -b main', { cwd: bareDir, timeout: 5000 });

		// 2. Clone it as the working repo (sets up tracking automatically)
		const projectDir = tmpDir('awm-behind-');
		dirs.push(projectDir);
		execSync(`git clone "${bareDir}" "${projectDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		// Need an initial commit so the branch exists
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin main', { cwd: projectDir, timeout: 5000 });

		// 3. Clone bare again, add a commit, push -- now projectDir is behind by 1
		const pusherDir = tmpDir('awm-pusher-');
		dirs.push(pusherDir);
		execSync(`git clone "${bareDir}" "${pusherDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: pusherDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: pusherDir, timeout: 5000 });
		fs.writeFileSync(path.join(pusherDir, 'ahead.txt'), 'ahead');
		execSync('git add .', { cwd: pusherDir, timeout: 5000 });
		execSync('git commit -m "ahead commit"', { cwd: pusherDir, timeout: 5000 });
		execSync('git push', { cwd: pusherDir, timeout: 5000 });

		// 4. Fetch in projectDir so it knows about the new remote commit
		execSync('git fetch', { cwd: projectDir, timeout: 5000 });

		// Set up config
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

		const awm = new AgentWorktreeManager(lcm, paths);

		// Spy on git to verify no worktree add is attempted
		const originalGit = gitModule.git;
		const gitSpy = vi.spyOn(gitModule, 'git').mockImplementation(
			(workDir: string, ...args: string[]) => {
				if (args[0] === 'worktree' && args[1] === 'add') {
					throw new Error('worktree add should not be called when behind remote');
				}
				return originalGit(workDir, ...args);
			}
		);

		try {
			const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0005-behind');
			expect(result).toEqual({ behindRemote: true });
			// Verify no worktree was created on disk
			expect(fs.existsSync(path.join(worktreeRoot, 'st-0005-behind'))).toBe(false);
		} finally {
			gitSpy.mockRestore();
		}
	});

	it('pullMainBranch with merge conflict: error contains git failure details and subsequent ensureAgentWorktree throws uncommitted changes', async () => {
		// 1. Create a bare repo as the "remote"
		const bareDir = tmpDir('awm-bare-conflict-');
		dirs.push(bareDir);
		execSync('git init --bare -b main', { cwd: bareDir, timeout: 5000 });

		// 2. Clone it as the working repo
		const projectDir = tmpDir('awm-conflict-');
		dirs.push(projectDir);
		execSync(`git clone "${bareDir}" "${projectDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		// Initial commit with a shared file
		fs.writeFileSync(path.join(projectDir, 'shared.txt'), 'line1\nline2\nline3\n');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init shared file"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin main', { cwd: projectDir, timeout: 5000 });

		// 3. Clone bare again, modify the same file on the same line, push
		const pusherDir = tmpDir('awm-pusher-conflict-');
		dirs.push(pusherDir);
		execSync(`git clone "${bareDir}" "${pusherDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: pusherDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: pusherDir, timeout: 5000 });
		fs.writeFileSync(path.join(pusherDir, 'shared.txt'), 'REMOTE CHANGE\nline2\nline3\n');
		execSync('git add .', { cwd: pusherDir, timeout: 5000 });
		execSync('git commit -m "remote modifies shared.txt"', { cwd: pusherDir, timeout: 5000 });
		execSync('git push', { cwd: pusherDir, timeout: 5000 });

		// 4. Modify same line locally in projectDir and commit (diverge)
		fs.writeFileSync(path.join(projectDir, 'shared.txt'), 'LOCAL CHANGE\nline2\nline3\n');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "local modifies shared.txt"', { cwd: projectDir, timeout: 5000 });

		// Fetch so git knows about the remote changes
		execSync('git fetch', { cwd: projectDir, timeout: 5000 });

		// 5. Set up config for ensureAgentWorktree
		const configDir = tmpDir('awm-config-conflict-');
		const worktreeRoot = tmpDir('awm-wt-conflict-');
		dirs.push(configDir, worktreeRoot);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('conflict-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, paths);

		// 6. pullMainBranch should fail with merge conflict details
		const pullError = await awm.pullMainBranch(projectDir).catch((e: Error) => e);
		expect(pullError).toBeInstanceOf(Error);
		const pullErr = pullError as Error;
		expect(pullErr.message).toContain('Failed to pull main branch');
		expect(pullErr.message).toContain('CONFLICT');

		// 7. After a failed pull with conflicts, the working tree has uncommitted merge artifacts.
		// ensureAgentWorktree should throw "uncommitted changes" -- documenting the confusing
		// error chain where a pull failure manifests as "uncommitted changes" on the next call.
		await expect(awm.ensureAgentWorktree(projectDir, 'conflict-proj', 'st-0006-conflict'))
			.rejects.toThrow('uncommitted changes');
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
		const awm = new AgentWorktreeManager(lcm, paths);

		// git branch --list 'main' should NOT match 'main-v2'
		// so getMainBranch should throw since neither 'main' nor 'master' exists
		await expect(awm.getMainBranch(projectDir)).rejects.toThrow('Neither main nor master');
	});

	it('concurrent ensureAgentWorktree for same folderName: at least one succeeds, the other succeeds or gets a clean error', async () => {
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

	it('pullMainBranch pulls current branch not main: bare git pull operates on whatever branch is checked out', async () => {
		// 1. Create a bare repo as the remote
		const bareDir = tmpDir('awm-bare-pullbranch-');
		dirs.push(bareDir);
		execSync('git init --bare -b main', { cwd: bareDir, timeout: 5000 });

		// 2. Clone as working repo, initial commit on main, push
		const projectDir = tmpDir('awm-pullbranch-');
		dirs.push(projectDir);
		execSync(`git clone "${bareDir}" "${projectDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: projectDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "init on main"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin main', { cwd: projectDir, timeout: 5000 });

		const mainCommitBefore = execSync('git rev-parse main', { cwd: projectDir, timeout: 5000 }).toString().trim();

		// 3. Create a feature branch, push it with tracking
		execSync('git checkout -b feature-x', { cwd: projectDir, timeout: 5000 });
		fs.writeFileSync(path.join(projectDir, 'feature.txt'), 'feature work');
		execSync('git add .', { cwd: projectDir, timeout: 5000 });
		execSync('git commit -m "feature commit"', { cwd: projectDir, timeout: 5000 });
		execSync('git push -u origin feature-x', { cwd: projectDir, timeout: 5000 });

		// 4. Add a new commit to feature-x on the remote via a second clone
		const pusherDir = tmpDir('awm-pusher-pullbranch-');
		dirs.push(pusherDir);
		execSync(`git clone "${bareDir}" "${pusherDir}"`, { timeout: 5000 });
		execSync('git config user.email "test@test.com"', { cwd: pusherDir, timeout: 5000 });
		execSync('git config user.name "Test"', { cwd: pusherDir, timeout: 5000 });
		execSync('git checkout feature-x', { cwd: pusherDir, timeout: 5000 });
		fs.writeFileSync(path.join(pusherDir, 'remote-feature.txt'), 'remote feature work');
		execSync('git add .', { cwd: pusherDir, timeout: 5000 });
		execSync('git commit -m "remote feature commit"', { cwd: pusherDir, timeout: 5000 });
		execSync('git push', { cwd: pusherDir, timeout: 5000 });

		// 5. In working repo, fetch so it knows about the remote commit
		execSync('git fetch', { cwd: projectDir, timeout: 5000 });

		// Confirm we are on feature-x, not main
		const currentBranch = execSync('git branch --show-current', { cwd: projectDir, timeout: 5000 }).toString().trim();
		expect(currentBranch).toBe('feature-x');

		// 6. Call pullMainBranch -- despite the name, it just runs `git pull`
		const configDir = tmpDir('awm-config-pullbranch-');
		dirs.push(configDir);
		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		const awm = new AgentWorktreeManager(lcm, paths);

		await awm.pullMainBranch(projectDir);

		// 7. Verify: the feature branch got the remote commit (remote-feature.txt exists)
		expect(fs.existsSync(path.join(projectDir, 'remote-feature.txt'))).toBe(true);

		// Verify: main is unchanged -- still at its original commit
		const mainCommitAfter = execSync('git rev-parse main', { cwd: projectDir, timeout: 5000 }).toString().trim();
		expect(mainCommitAfter).toBe(mainCommitBefore);

		// The method pulled the feature branch, not main. This confirms the method name
		// is misleading: pullMainBranch does not switch to main before pulling.
		// In the pull-and-retry flow, if the user is on a feature branch, this pulls
		// the wrong branch entirely.
	});

	it('behind-remote catch swallows non-upstream errors: generic rev-list failure logs warning and worktree creation proceeds', async () => {
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

	it('branch already checked out in another worktree: changing worktreeRootPath causes git to refuse duplicate checkout', async () => {
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

		const awm = new AgentWorktreeManager(lcm, paths);
		const folderName = 'st-dup-branch';

		// First call: creates worktree at path A with branch ai/st-dup-branch
		const result1 = await awm.ensureAgentWorktree(projectDir, 'dup-proj', folderName);
		expect('worktreePath' in result1).toBe(true);
		if ('worktreePath' in result1) {
			expect(fs.existsSync(result1.worktreePath)).toBe(true);
		}

		// Verify the branch exists
		const branchCheck = execSync('git branch --list ai/st-dup-branch', { cwd: projectDir, timeout: 5000 }).toString();
		expect(branchCheck.trim()).toBeTruthy();

		// Change worktreeRootPath to path B (simulating user config change)
		lcm.saveProjectConfig('dup-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRootB,
		});

		// Second call: worktree at path B does not exist, branch ai/st-dup-branch exists,
		// so it tries `git worktree add <pathB>/st-dup-branch ai/st-dup-branch`.
		// Git should refuse because the branch is already checked out in worktree A.
		const error = await awm.ensureAgentWorktree(projectDir, 'dup-proj', folderName)
			.catch((e: Error) => e);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/already checked out|is already used by worktree/i);
	});

	it('rev-list returns non-numeric output: parseInt produces NaN, NaN > 0 is false, silently skipping behind-remote check', async () => {
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

	it('defaults to projects/{slug}/worktrees/ when worktreeRootPath is not configured', async () => {
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

		const awm = new AgentWorktreeManager(lcm, paths);

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

	it('pullMainBranch error short-circuits pull-and-retry flow: ensureAgentWorktree is never called and error contains pull failure details', async () => {
		const { projectDir, awm } = setup();

		// Mock git to throw on pull with specific failure details
		const originalGit = gitModule.git;
		const gitSpy = vi.spyOn(gitModule, 'git').mockImplementation(
			(workDir: string, ...args: string[]) => {
				if (args[0] === 'pull') {
					return Promise.reject(new Error(
						'error: Your local changes to the following files would be overwritten by merge:\n' +
						'  src/important-file.ts\n' +
						'Please commit your changes or stash them before you merge.'
					));
				}
				return originalGit(workDir, ...args);
			}
		);

		// Spy on ensureAgentWorktree to verify it is never called
		const ensureSpy = vi.spyOn(awm, 'ensureAgentWorktree');

		try {
			// Replicate the exact control flow from pull-and-retry.ts lines 17-33:
			//   await agentWorktreeManager.pullMainBranch(project.path);   // line 17
			//   ...                                                        // lines 19-26
			//   const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(...)  // line 27
			//
			// If pullMainBranch throws, execution jumps to the outer catch (line 34)
			// and ensureAgentWorktree is never reached.

			let caughtError: Error | undefined;
			try {
				await awm.pullMainBranch(projectDir);
				// If pullMainBranch succeeded, ensureAgentWorktree would be called next.
				// But it should throw, so this line should not execute.
				await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-pull-fail');
			} catch (e) {
				caughtError = e as Error;
			}

			// 1. pullMainBranch threw, so ensureAgentWorktree was never reached
			expect(ensureSpy).not.toHaveBeenCalled();

			// 2. The error contains the "Failed to pull main branch:" wrapper from pullMainBranch
			expect(caughtError).toBeInstanceOf(Error);
			expect(caughtError!.message).toContain('Failed to pull main branch');

			// 3. The error preserves the specific git failure details (not a generic message)
			expect(caughtError!.message).toContain('local changes');
			expect(caughtError!.message).toContain('src/important-file.ts');

			// 4. In pull-and-retry.ts, this error reaches errorMessage(e) on line 35,
			//    which extracts e.message. Verify errorMessage produces the full details.
			const { errorMessage } = await import('./errors.js');
			const responseBody = errorMessage(caughtError);
			expect(responseBody).toContain('Failed to pull main branch');
			expect(responseBody).toContain('src/important-file.ts');
			// This confirms the 500 response body contains the specific pull failure
			// details, not a generic "Unknown error" message.
		} finally {
			gitSpy.mockRestore();
			ensureSpy.mockRestore();
		}
	});

	it('pull-and-retry still behind remote after pull: pull succeeds but ensureAgentWorktree returns behindRemote again', async () => {
		const { projectDir, awm } = setup();

		// Mock git so that:
		// 1. pull succeeds (returns normally) -- simulating a successful but no-op pull
		//    (e.g., "Already up to date" when local is on the right commit but remote
		//    was force-pushed to a different history)
		// 2. rev-list HEAD..@{upstream} --count returns "3" -- still behind after pulling
		const originalGit = gitModule.git;
		const gitSpy = vi.spyOn(gitModule, 'git').mockImplementation(
			(workDir: string, ...args: string[]) => {
				if (args[0] === 'pull') {
					return Promise.resolve('Already up to date.\n');
				}
				if (args[0] === 'rev-list' && args.some(a => a.includes('@{upstream}'))) {
					return Promise.resolve('3\n');
				}
				return originalGit(workDir, ...args);
			}
		);

		try {
			// Replicate the exact control flow from pull-and-retry.ts lines 17-31:
			//   await agentWorktreeManager.pullMainBranch(project.path);       // line 17
			//   ... readLaunchRequest ...                                      // lines 19-20
			//   const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(...)  // line 27
			//   if ('behindRemote' in worktreeResult) {                        // line 28
			//     return new Response("Still behind remote after pulling", { status: 500 }); // line 29
			//   }

			// Step 1: pullMainBranch succeeds (no throw)
			await awm.pullMainBranch(projectDir);

			// Step 2: ensureAgentWorktree returns behindRemote because rev-list still shows ahead commits
			const worktreeResult = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-still-behind');

			// Step 3: The route checks for behindRemote and returns 500
			expect('behindRemote' in worktreeResult).toBe(true);
			if ('behindRemote' in worktreeResult) {
				expect(worktreeResult.behindRemote).toBe(true);
			}

			// Step 4: Replicate the response construction from pull-and-retry.ts line 29
			const status = 'behindRemote' in worktreeResult ? 500 : 200;
			const body = 'behindRemote' in worktreeResult ? 'Still behind remote after pulling' : null;

			expect(status).toBe(500);
			expect(body).toBe('Still behind remote after pulling');

			// Step 5: Verify no worktree was created (ensureAgentWorktree returned early)
			const worktreeList = await originalGit(projectDir, 'worktree', 'list', '--porcelain');
			expect(worktreeList).not.toContain('st-still-behind');
		} finally {
			gitSpy.mockRestore();
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
			const branchList = execSync('git branch --list ai/st-delbranch', { cwd: projectDir, timeout: 5000 }).toString();
			expect(branchList.trim()).toBe('');
		}
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

		const awm = new AgentWorktreeManager(lcm, paths);

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
});
