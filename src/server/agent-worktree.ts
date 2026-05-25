import { git } from './git.js';
import type { LauncherConfigManager } from './launcher-config.js';
import type { ConfigPaths } from './config-paths.js';

export interface WorktreeResult {
	worktreePath: string;
}

export interface BehindRemoteResult {
	behindRemote: true;
}

export class AgentWorktreeManager {
	constructor(
		private launcherConfig: LauncherConfigManager,
		private paths: ConfigPaths,
	) {}

	async getMainBranch(projectPath: string): Promise<string> {
		for (const name of ['main', 'master']) {
			const list = await git(projectPath, 'branch', '--list', name);
			if (list.trim()) return name;
		}
		throw new Error('Neither main nor master branch exists');
	}

	async ensureAgentWorktree(
		projectPath: string,
		slug: string,
		folderName: string
	): Promise<WorktreeResult | BehindRemoteResult> {
		const config = this.launcherConfig.loadProjectConfig(slug);
		const worktreeRootPath = config.worktreeRootPath || this.paths.agentWorktreeDir(slug);

		const branchName = `ai/${folderName}`;
		const worktreePath = `${worktreeRootPath}/${folderName}`;
		const mainBranch = await this.getMainBranch(projectPath);

		const status = await git(projectPath, 'status', '--porcelain');
		if (status.trim()) {
			throw new Error('Main branch has uncommitted changes. Commit or stash before launching.');
		}

		try {
			const behindCount = await git(projectPath, 'rev-list', `HEAD..@{upstream}`, '--count');
			if (parseInt(behindCount.trim(), 10) > 0) {
				return { behindRemote: true };
			}
		} catch (e) {
			// No upstream configured -- skip the behind-remote check
			console.warn('Skipping upstream check:', e instanceof Error ? e.message : e);
		}

		const worktreeListOutput = await git(projectPath, 'worktree', 'list', '--porcelain');
		const normalizedTarget = worktreePath.replace(/\\/g, '/');
		const alreadyExists = worktreeListOutput
			.split('\n')
			.some(line =>
				line.startsWith('worktree ') &&
				line.slice('worktree '.length).trim().replace(/\\/g, '/') === normalizedTarget
			);

		if (alreadyExists) {
			return { worktreePath };
		}

		const branchList = await git(projectPath, 'branch', '--list', branchName);
		if (branchList.trim()) {
			await git(projectPath, 'worktree', 'add', worktreePath, branchName);
		} else {
			await git(projectPath, 'worktree', 'add', '-b', branchName, worktreePath, mainBranch);
		}

		return { worktreePath };
	}

	async pullMainBranch(projectPath: string): Promise<void> {
		try {
			await git(projectPath, 'pull');
		} catch (e) {
			throw new Error(`Failed to pull main branch: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async isWorktreeClean(worktreePath: string): Promise<boolean> {
		const status = await git(worktreePath, 'status', '--porcelain');
		return !status.trim();
	}

	async hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean> {
		try {
			const output = await git(projectPath, 'ls-remote', '--heads', 'origin', branchName);
			return output.trim().length > 0;
		} catch {
			return false;
		}
	}

	async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
		await git(projectPath, 'worktree', 'remove', worktreePath);
	}

	async deleteLocalBranch(projectPath: string, branchName: string): Promise<void> {
		await git(projectPath, 'branch', '-D', branchName);
	}

	async deleteRemoteBranch(projectPath: string, branchName: string): Promise<void> {
		await git(projectPath, 'push', 'origin', '--delete', branchName);
	}
}
