import type { AgentWorktreeManager } from './agent-worktree.js';

export interface CleanupOptions {
	deleteWorktree: boolean;
	deleteLocalBranch: boolean;
	deleteRemoteBranch: boolean;
}

export class WorktreeCleanupService {
	constructor(private agentWorktreeManager: AgentWorktreeManager) {}

	async cleanup(
		projectPath: string,
		folderName: string,
		worktreePath: string,
		options: CleanupOptions
	): Promise<void> {
		const branchName = `ai/${folderName}`;

		if (options.deleteWorktree) {
			const clean = await this.agentWorktreeManager.isWorktreeClean(worktreePath);
			if (!clean) {
				throw new Error('Worktree has uncommitted changes. Commit or discard them before cleanup.');
			}
			const busy = await this.agentWorktreeManager.isWorktreeBusy(worktreePath);
			if (busy) {
				throw new Error(
				'Worktree folder is in use by another process.'
				+ ' Close any editors, terminals, or running programs that use this folder, then try again.',
			);
			}
		}

		if (options.deleteLocalBranch) {
			const merged = await this.agentWorktreeManager.isBranchMerged(projectPath, branchName);
			if (!merged) {
				throw new Error(
					`Branch '${branchName}' has unmerged commits.`
					+ ' Merge or force-delete the branch before cleanup.',
				);
			}
		}

		if (options.deleteRemoteBranch) {
			const exists = await this.agentWorktreeManager.hasRemoteBranch(projectPath, branchName);
			if (!exists) {
				throw new Error(`Remote branch ${branchName} does not exist.`);
			}
		}

		if (options.deleteWorktree) {
			await this.agentWorktreeManager.removeWorktree(projectPath, worktreePath);
		}

		if (options.deleteLocalBranch) {
			await this.agentWorktreeManager.deleteLocalBranch(projectPath, branchName);
		}

		if (options.deleteRemoteBranch) {
			await this.agentWorktreeManager.deleteRemoteBranch(projectPath, branchName);
		}
	}
}
