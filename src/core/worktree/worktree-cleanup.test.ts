import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { git } from '~/test-git.js';
import { makeCleanupEnv } from './worktree-cleanup.test-utils.js';

describe('WorktreeCleanupService', () => {
	const { setup, cleanupAll } = makeCleanupEnv();

	afterAll(cleanupAll);

	it.concurrent(
		'cleanup with deleteWorktree and deleteLocalBranch removes both',
		async () => {
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
			const branchList = await git(projectDir, 'branch', '--list', 'st-cleanup-both');
			expect(branchList.trim()).toBe('');
		});

	it.concurrent('cleanup removes a folder that is no longer a git worktree', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-notgit';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		fs.rmSync(path.join(result.worktreePath, '.git'));

		await service.cleanup(projectDir, folderName, result.worktreePath, {
			deleteWorktree: true,
			deleteLocalBranch: false,
			deleteRemoteBranch: false,
		});

		expect(fs.existsSync(result.worktreePath)).toBe(false);
	});

	it.concurrent('cleanup with only deleteLocalBranch skips worktree removal', async () => {
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
		}, undefined);

		const branchList = await git(projectDir, 'branch', '--list', folderName);
		expect(branchList.trim()).toBe('');
	});

	it.concurrent('cleanup with all options false is a no-op', async () => {
		const { projectDir, awm, service } = setup();
		const folderName = 'st-cleanup-noop';
		const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName);
		expect('worktreePath' in result).toBe(true);
		if (!('worktreePath' in result)) return;

		await service.cleanup(projectDir, folderName, result.worktreePath, {
			deleteWorktree: false,
			deleteLocalBranch: false,
			deleteRemoteBranch: false,
		}, undefined);

		expect(fs.existsSync(result.worktreePath)).toBe(true);
		const branchList = await git(projectDir, 'branch', '--list', folderName);
		expect(branchList.trim()).toBeTruthy();
	});
});
