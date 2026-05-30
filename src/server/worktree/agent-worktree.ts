import fs from 'fs';
import path from 'path';
import { rename } from 'fs/promises';
import { exec } from 'child_process';
import { git } from '../infra/git.js';
import { ProcessError } from '../shared/errors.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';
import type { ConfigPaths } from '../config/config-paths.js';

function canonicalize(p: string): string {
	const slashed = p.replace(/\\/g, '/');
	try {
		return fs.realpathSync(slashed);
	} catch {
		try {
			const parent = path.posix.dirname(slashed);
			const base = path.posix.basename(slashed);
			return `${fs.realpathSync(parent)}/${base}`;
		} catch {
			return slashed;
		}
	}
}

export interface WorktreeResult {
	worktreePath: string;
}

export interface BehindRemoteResult {
	behindRemote: true;
}

export interface DirtyWorktreeResult {
	dirtyWorktree: true;
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
		projectSlug: string,
		folderName: string,
		options?: { skipDirtyCheck?: boolean }
	): Promise<WorktreeResult | BehindRemoteResult | DirtyWorktreeResult> {
		const config = this.launcherConfig.loadProjectConfig(projectSlug);
		const worktreeRootPath = config.worktreeRootPath || this.paths.agentWorktreeDir(projectSlug);

		const branchName = `ai/${folderName}`;
		const worktreePath = `${worktreeRootPath}/${folderName}`;
		const mainBranch = await this.getMainBranch(projectPath);

		if (!options?.skipDirtyCheck) {
			const status = await git(projectPath, 'status', '--porcelain');
			if (status.trim()) {
				return { dirtyWorktree: true };
			}
		}

		try {
			const behindCount = await git(
				projectPath, 'rev-list',
				`${mainBranch}..${mainBranch}@{upstream}`, '--count',
			);
			if (parseInt(behindCount.trim(), 10) > 0) {
				return { behindRemote: true };
			}
		} catch (e) {
			// No upstream configured for main -- skip the behind-remote check
			console.warn('Skipping upstream check:', e instanceof Error ? e.message : e);
		}

		const worktreeListOutput = await git(projectPath, 'worktree', 'list', '--porcelain');
		const normalizedTarget = canonicalize(worktreePath);
		const alreadyExists = worktreeListOutput
			.split('\n')
			.some(line =>
				line.startsWith('worktree ') &&
				canonicalize(line.slice('worktree '.length).trim()) === normalizedTarget
			);

		if (alreadyExists) {
			return { worktreePath };
		}

		const branchList = await git(projectPath, 'branch', '--list', branchName);
		if (branchList.trim()) {
			await this.releaseBranchFromOtherWorktree(projectPath, worktreePath, branchName);
			await git(projectPath, 'worktree', 'add', worktreePath, branchName);
		} else {
			await git(projectPath, 'worktree', 'add', '-b', branchName, worktreePath, mainBranch);
		}

		return { worktreePath };
	}

	async pullMainBranch(projectPath: string): Promise<void> {
		try {
			const mainBranch = await this.getMainBranch(projectPath);
			const currentBranch = (await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
			if (currentBranch === mainBranch) {
				await git(projectPath, 'pull', '--no-rebase');
			} else {
				await git(projectPath, 'fetch', 'origin', mainBranch);
				await git(projectPath, 'branch', '-f', mainBranch, `origin/${mainBranch}`);
			}
		} catch (e) {
			if (e instanceof ProcessError) {
				throw new ProcessError(e.command, e.exitCode, e.output, 'Failed to pull main branch');
			}
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

	async isWorktreeBusy(worktreePath: string): Promise<boolean> {
		if (process.platform === 'win32') {
			const probe = worktreePath + '.busy-probe';
			try {
				await rename(worktreePath, probe);
				await rename(probe, worktreePath);
				return false;
			} catch (e: any) {
				if (e.code === 'ENOENT') return false;
				return true;
			}
		}
		return new Promise((resolve) => {
			exec(`lsof +D "${worktreePath}"`, { timeout: 5000 }, (_error, stdout) => {
				const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('COMMAND'));
				resolve(lines.length > 0);
			});
		});
	}

	private async releaseBranchFromOtherWorktree(
		projectPath: string, targetWorktreePath: string, branchName: string,
	): Promise<void> {
		await git(projectPath, 'worktree', 'prune');
		const existing = await this.worktreePathForBranch(projectPath, branchName);
		if (existing && canonicalize(existing) !== canonicalize(targetWorktreePath)) {
			await git(projectPath, 'worktree', 'remove', '--force', existing);
		}
	}

	private async worktreePathForBranch(projectPath: string, branchName: string): Promise<string | null> {
		const out = await git(projectPath, 'worktree', 'list', '--porcelain');
		let currentPath: string | null = null;
		for (const line of out.split('\n')) {
			if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
			else if (line.trim() === `branch refs/heads/${branchName}` && currentPath) return currentPath;
		}
		return null;
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
