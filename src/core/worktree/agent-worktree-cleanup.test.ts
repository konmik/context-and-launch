import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { initializeDataDir } from '../config/initialize.js';
import { git } from '~/test-git.js';
import { makeWorktreeEnv, initGitRepo, tmpDir } from './agent-worktree.test-utils.js';

describe('AgentWorktreeManager cleanup', () => {
	const { dirs, setup, cleanupAll } = makeWorktreeEnv();

	afterAll(cleanupAll);

	it.concurrent('isWorktreeClean returns true for clean worktree', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-clean-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const clean = await awm.isWorktreeClean(result.worktreePath);
			expect(clean).toBe(true);
		}
	});

	it.concurrent('isWorktreeClean returns false for dirty worktree', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-dirty-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			fs.writeFileSync(path.join(result.worktreePath, 'dirty.txt'), 'dirty');
			const clean = await awm.isWorktreeClean(result.worktreePath);
			expect(clean).toBe(false);
		}
	});

	it.concurrent('isWorktreeClean surfaces a probe that never produced an answer', async () => {
		const { awm } = setup();
		// A registered Agent Worktree whose directory is no longer a git worktree:
		// `git status` cannot answer, so cleanup must not read that as "clean".
		const notARepo = tmpDir('awm-not-a-repo-');
		dirs.push(notARepo);
		await expect(awm.isWorktreeClean(notARepo)).rejects.toThrow();
	});

	it.concurrent('removeWorktree removes the worktree directory', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-remove-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			await awm.removeWorktree(projectDir, result.worktreePath);
			expect(fs.existsSync(result.worktreePath)).toBe(false);
		}
	});

	it.concurrent('removeWorktree refuses to destroy a worktree git declined to remove', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-locked-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			// The user locked the worktree to protect it; git refuses to remove it.
			await git(projectDir, 'worktree', 'lock', result.worktreePath);
			await expect(awm.removeWorktree(projectDir, result.worktreePath)).rejects.toThrow();
			expect(fs.existsSync(result.worktreePath)).toBe(true);
			await git(projectDir, 'worktree', 'unlock', result.worktreePath);
		}
	});

	it.concurrent('removeWorktree drops a folder that is no longer a git worktree', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-stray-test');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			fs.rmSync(path.join(result.worktreePath, '.git'));
			expect(awm.isGitWorktree(result.worktreePath)).toBe(false);
			await awm.removeWorktree(projectDir, result.worktreePath);
			expect(fs.existsSync(result.worktreePath)).toBe(false);
		}
	});

	it.concurrent('deleteLocalBranch removes the branch', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-delbranch');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			await awm.removeWorktree(projectDir, result.worktreePath);
			await awm.deleteLocalBranch(projectDir, 'st-delbranch');
			const branchList = await git(projectDir, 'branch', '--list', 'st-delbranch');
			expect(branchList.trim()).toBe('');
		}
	});

	it.concurrent(
		'deleteLocalBranch succeeds when HEAD is not on mainBranch but branch is merged into main', async () => {
		const { projectDir, awm } = setup();

		await git(projectDir, 'checkout', '-b', 'other-branch');
		fs.writeFileSync(path.join(projectDir, 'other.txt'), 'diverged work');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'diverge from main');
		await git(projectDir, 'checkout', 'main');

		await git(projectDir, 'checkout', '-b', 'st-merged-feat');
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature work');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feature commit');
		await git(projectDir, 'checkout', 'main');
		await git(projectDir, 'merge', 'st-merged-feat');

		const merged = await awm.isBranchMerged(projectDir, 'st-merged-feat');
		expect(merged).toBe(true);

		await git(projectDir, 'checkout', 'other-branch');
		const head = (await git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
		expect(head).toBe('other-branch');

		await awm.deleteLocalBranch(projectDir, 'st-merged-feat');

		const branchList = await git(projectDir, 'branch', '--list', 'st-merged-feat');
		expect(branchList.trim()).toBe('');
	});

	it.concurrent(
		'ensureAgentWorktree with configuredBranch "develop" succeeds in repo with only develop branch',
		async () => {
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

	it.concurrent('isBranchMerged detects squash-merged branch', async () => {
		const { projectDir, awm } = setup();

		await git(projectDir, 'checkout', '-b', 'st-squash-feat');
		fs.writeFileSync(path.join(projectDir, 'feat1.txt'), 'part 1');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feat part 1');
		fs.writeFileSync(path.join(projectDir, 'feat2.txt'), 'part 2');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feat part 2');

		await git(projectDir, 'checkout', 'main');
		await git(projectDir, 'merge', '--squash', 'st-squash-feat');
		await git(projectDir, 'commit', '-m', 'squash: feat');

		const merged = await awm.isBranchMerged(projectDir, 'st-squash-feat');
		expect(merged).toBe(true);
	});

	it.concurrent(
		'isBranchMerged detects squash-merged branch when main has moved forward',
		async () => {
		const { projectDir, awm } = setup();

		await git(projectDir, 'checkout', '-b', 'st-squash-moved');
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feature commit');

		await git(projectDir, 'checkout', 'main');
		await git(projectDir, 'merge', '--squash', 'st-squash-moved');
		await git(projectDir, 'commit', '-m', 'squash: feature');

		fs.writeFileSync(path.join(projectDir, 'other.txt'), 'later work');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'more work on main');

		const merged = await awm.isBranchMerged(projectDir, 'st-squash-moved');
		expect(merged).toBe(true);
	});

	it('isBranchMerged detects squash-merged branch on remote when local main is behind', async () => {
		const remoteDir = tmpDir('awm-remote-');
		dirs.push(remoteDir);
		initGitRepo(remoteDir);
		const projectDir = tmpDir('awm-cloned-');
		dirs.push(projectDir);
		await git(os.tmpdir(), 'clone', remoteDir, projectDir);

		await git(projectDir, 'checkout', '-b', 'st-remote-squash');
		fs.writeFileSync(path.join(projectDir, 'feat.txt'), 'feature');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'feature');
		await git(projectDir, 'checkout', 'main');

		await git(remoteDir, 'checkout', 'main');
		await git(remoteDir, 'fetch', projectDir, 'st-remote-squash');
		await git(remoteDir, 'merge', '--squash', 'FETCH_HEAD');
		await git(remoteDir, 'commit', '-m', 'squash: feature');

		const configDir = tmpDir('awm-config-rsq-');
		dirs.push(configDir);
		const paths = new ConfigPaths(configDir);
		initializeDataDir(paths);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', { templates: [], skills: [], worktreeRootPath: tmpDir('awm-wt-rsq-') });
		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

		const merged = await awm.isBranchMerged(projectDir, 'st-remote-squash');
		expect(merged).toBe(true);
	});

	it.concurrent('isBranchMerged returns false for unmerged branch', async () => {
		const { projectDir, awm } = setup();

		await git(projectDir, 'checkout', '-b', 'st-unmerged');
		fs.writeFileSync(path.join(projectDir, 'unmerged.txt'), 'not merged');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'unmerged work');
		await git(projectDir, 'checkout', 'main');

		const merged = await awm.isBranchMerged(projectDir, 'st-unmerged');
		expect(merged).toBe(false);
	});

	it.concurrent('isBranchMerged returns false when an unmerged branch conflicts with main', async () => {
		const { projectDir, awm } = setup();

		await git(projectDir, 'checkout', '-b', 'st-conflicting');
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# branch');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'branch change');

		await git(projectDir, 'checkout', 'main');
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# main');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'main change');

		const merged = await awm.isBranchMerged(projectDir, 'st-conflicting');
		expect(merged).toBe(false);
	});

	it.concurrent('isBranchMerged throws a clear error when the branch no longer exists', async () => {
		const { projectDir, awm } = setup();

		await expect(awm.isBranchMerged(projectDir, 'st-renamed-away')).rejects.toThrow(
			/Branch 'st-renamed-away' no longer exists/,
		);
	});

	it.concurrent(
		'isBranchMerged with configuredBranch "develop" succeeds in repo with only develop branch', async () => {
		const { projectDir, awm } = setup('develop');
		const result = await awm.ensureAgentWorktree(
			projectDir, 'my-proj', 'st-merged-develop', undefined, 'develop',
		);
		expect('worktreePath' in result).toBe(true);
		const merged = await awm.isBranchMerged(projectDir, 'st-merged-develop', 'develop');
		expect(merged).toBe(true);
	});

	it.concurrent(
		'worktreeRootPath directory does not exist on disk: git worktree add creates it automatically', async () => {
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

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());

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

	it.concurrent('isWorktreeBusy returns false for an unoccupied directory', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-busy-free');
		expect('worktreePath' in result).toBe(true);
		if ('worktreePath' in result) {
			const busy = await awm.isWorktreeBusy(result.worktreePath);
			expect(busy).toBe(false);
		}
	});

	it.concurrent('isWorktreeBusy returns false for a nonexistent path', async () => {
		const { awm } = setup();
		const busy = await awm.isWorktreeBusy(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
		expect(busy).toBe(false);
	});

	it.concurrent('isWorktreeBusy returns true when a process occupies the directory', async () => {
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

	it.concurrent('returns branchName in the result', async () => {
		const { projectDir, awm } = setup();
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', 'st-0010-branch-result');
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;
		expect(result.branchName).toBe('st-0010-branch-result');
	});

	it.concurrent('uses savedWorktreeInfo instead of deriving from folderName (ticket rename)', async () => {
		const { projectDir, awm } = setup();
		const originalFolder = 'st-0011-original-name';
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', originalFolder);
		expect('worktreePath' in result1).toBe(true);
		if (!('worktreePath' in result1)) return;

		const renamedFolder = 'st-0011-renamed-ticket';
		const result2 = await awm.ensureAgentWorktree(
			projectDir, 'my-proj', renamedFolder,
			undefined, undefined,
			{ branchName: originalFolder, agentWorktreePath: result1.worktreePath },
		);
		expect('worktreePath' in result2).toBe(true);
		if (!('worktreePath' in result2)) return;
		expect(result2.worktreePath).toBe(result1.worktreePath);
		expect(result2.branchName).toBe(originalFolder);
		expect(fs.existsSync(result2.worktreePath)).toBe(true);
	});

	it.concurrent('uses savedWorktreeInfo with changed branchPrefix', async () => {
		const { projectDir, worktreeRoot, awm, lcm } = setup();
		lcm.saveProjectConfig('my-proj', {
			templates: [], skills: [],
			worktreeRootPath: worktreeRoot,
			branchPrefix: 'feature',
		});
		const folderName = 'st-0012-prefix-change';
		const result1 = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result1).toBe(true);
		if (!('worktreePath' in result1)) return;
		expect(result1.branchName).toBe('feature/st-0012-prefix-change');

		lcm.saveProjectConfig('my-proj', {
			templates: [], skills: [],
			worktreeRootPath: worktreeRoot,
			branchPrefix: 'dev',
		});

		const result2 = await awm.ensureAgentWorktree(
			projectDir, 'my-proj', folderName,
			undefined, undefined,
			{ branchName: result1.branchName, agentWorktreePath: result1.worktreePath },
		);
		expect('worktreePath' in result2).toBe(true);
		if (!('worktreePath' in result2)) return;
		expect(result2.worktreePath).toBe(result1.worktreePath);
		expect(result2.branchName).toBe('feature/st-0012-prefix-change');
	});
});
