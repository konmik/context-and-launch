import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { WorktreeCleanupService } from './worktree-cleanup.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			try { execSync('git worktree prune', { cwd: d, timeout: 5000 }); } catch { /* ok */ }
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
		}
	}
}

function initGitRepo(dir: string): void {
	execSync('git init -b main', { cwd: dir, timeout: 5000 });
	execSync('git config user.email "test@test.com"', { cwd: dir, timeout: 5000 });
	execSync('git config user.name "Test"', { cwd: dir, timeout: 5000 });
	fs.writeFileSync(path.join(dir, 'README.md'), '# test');
	execSync('git add .', { cwd: dir, timeout: 5000 });
	execSync('git commit -m "init"', { cwd: dir, timeout: 5000 });
}

describe('WorktreeCleanupService', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	function setup() {
		const configDir = tmpDir('wcs-config-');
		const projectDir = tmpDir('wcs-project-');
		const worktreeRoot = tmpDir('wcs-worktrees-');
		dirs.push(configDir, projectDir, worktreeRoot);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			boardId: 'standard',
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, paths);
		const service = new WorktreeCleanupService(awm);
		return { configDir, projectDir, worktreeRoot, lcm, awm, service };
	}

	it('cleanup with deleteWorktree and deleteLocalBranch removes both', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-both';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		await service.cleanup(projectDir, folderName, result.worktreePath, {
			deleteWorktree: true,
			deleteLocalBranch: true,
			deleteRemoteBranch: false,
		});

		expect(fs.existsSync(result.worktreePath)).toBe(false);
		const branchList = execSync(
			'git branch --list ai/st-cleanup-both', { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBe('');
	});

	it('cleanup with dirty worktree throws and changes nothing', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-dirty';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		fs.writeFileSync(path.join(result.worktreePath, 'dirty.txt'), 'uncommitted');

		await expect(
			service.cleanup(projectDir, folderName, result.worktreePath, {
				deleteWorktree: true,
				deleteLocalBranch: true,
				deleteRemoteBranch: false,
			})
		).rejects.toThrow(/uncommitted changes/);

		expect(fs.existsSync(result.worktreePath)).toBe(true);
		const branchList = execSync(
			`git branch --list ai/${folderName}`, { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBeTruthy();
	});

	it('cleanup with deleteRemoteBranch checked but no remote throws and changes nothing', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-noremote';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		await expect(
			service.cleanup(projectDir, folderName, result.worktreePath, {
				deleteWorktree: false,
				deleteLocalBranch: false,
				deleteRemoteBranch: true,
			})
		).rejects.toThrow(/does not exist/);

		expect(fs.existsSync(result.worktreePath)).toBe(true);
	});

	it('cleanup with only deleteLocalBranch skips worktree removal', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-branchonly';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		await awm.removeWorktree(projectDir, result.worktreePath);

		await service.cleanup(projectDir, folderName, result.worktreePath, {
			deleteWorktree: false,
			deleteLocalBranch: true,
			deleteRemoteBranch: false,
		});

		const branchList = execSync(
			`git branch --list ai/${folderName}`, { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBe('');
	});

	it('cleanup with all options false is a no-op', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-noop';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		await service.cleanup(projectDir, folderName, result.worktreePath, {
			deleteWorktree: false,
			deleteLocalBranch: false,
			deleteRemoteBranch: false,
		});

		expect(fs.existsSync(result.worktreePath)).toBe(true);
		const branchList = execSync(
			`git branch --list ai/${folderName}`, { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBeTruthy();
	});

	it('cleanup with unmerged branch throws before deleting the worktree', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-unmerged';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		fs.writeFileSync(path.join(result.worktreePath, 'feature.txt'), 'new feature');
		execSync('git add .', { cwd: result.worktreePath, timeout: 5000 });
		execSync('git commit -m "add feature"', { cwd: result.worktreePath, timeout: 5000 });

		await expect(
			service.cleanup(projectDir, folderName, result.worktreePath, {
				deleteWorktree: true,
				deleteLocalBranch: true,
				deleteRemoteBranch: false,
			})
		).rejects.toThrow(/unmerged/i);

		expect(fs.existsSync(result.worktreePath)).toBe(true);
		const branchList = execSync(
			`git branch --list ai/${folderName}`, { cwd: projectDir, timeout: 5000 },
		).toString();
		expect(branchList.trim()).toBeTruthy();
	});

	it('cleanup with busy worktree throws and changes nothing', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-busy';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		const child: ChildProcess = spawn(
			process.execPath,
			['-e', 'setTimeout(() => {}, 60000)'],
			{ cwd: result.worktreePath, stdio: 'pipe' }
		);

		try {
			await new Promise(r => setTimeout(r, 200));

			await expect(
				service.cleanup(projectDir, folderName, result.worktreePath, {
					deleteWorktree: true,
					deleteLocalBranch: true,
					deleteRemoteBranch: false,
				})
			).rejects.toThrow(/in use by another process/);

			expect(fs.existsSync(result.worktreePath)).toBe(true);
			const branchList = execSync(
			`git branch --list ai/${folderName}`, { cwd: projectDir, timeout: 5000 },
		).toString();
			expect(branchList.trim()).toBeTruthy();
		} finally {
			child.kill();
		}
	});
});
