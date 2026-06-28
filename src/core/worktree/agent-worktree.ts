import fs from 'fs';
import path from 'path';
import { rename } from 'fs/promises';
import { exec } from 'child_process';
import { git, detectMainBranch } from '../infra/git.js';
import { worktreeBranchName, worktreeFolderName } from './worktree-naming.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';


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
	behindRemote?: true;
}

export interface DirtyWorktreeResult {
	dirtyWorktree: true;
}

export class AgentWorktreeManager {
	constructor(
		private launcherConfig: LauncherConfigManager,
	) {}

	async getMainBranch(projectPath: string, configuredBranch?: string): Promise<string> {
		const trimmed = configuredBranch?.trim();
		if (trimmed) return trimmed;
		return detectMainBranch(projectPath);
	}

	async ensureAgentWorktree(
		projectPath: string,
		projectSlug: string,
		folderName: string,
		options?: { skipDirtyCheck?: boolean },
		configuredBranch?: string,
	): Promise<WorktreeResult | DirtyWorktreeResult> {
		const worktreeRootPath = this.launcherConfig.resolveAgentWorktreeRoot(projectSlug);

		const branchName = worktreeBranchName(folderName);
		const worktreePath = `${worktreeRootPath}/${worktreeFolderName(folderName)}`;
		const mainBranch = await this.getMainBranch(projectPath, configuredBranch);

		if (!options?.skipDirtyCheck) {
			const status = await git(projectPath, 'status', '--porcelain');
			if (status.trim()) {
				return { dirtyWorktree: true };
			}
		}

		let behindRemote = false;
		try {
			const behindCount = await git(
				projectPath, 'rev-list',
				`${mainBranch}..${mainBranch}@{upstream}`, '--count',
			);
			if (parseInt(behindCount.trim(), 10) > 0) {
				behindRemote = true;
			}
		} catch (e) {
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
			return behindRemote ? { worktreePath, behindRemote } : { worktreePath };
		}

		const branchList = await git(projectPath, 'branch', '--list', branchName);
		if (branchList.trim()) {
			await this.releaseBranchFromOtherWorktree(projectPath, worktreePath, branchName);
			await git(projectPath, 'worktree', 'add', worktreePath, branchName);
		} else {
			await git(projectPath, 'worktree', 'add', '-b', branchName, worktreePath, mainBranch);
		}

		return behindRemote ? { worktreePath, behindRemote } : { worktreePath };
	}

	async isWorktreeClean(worktreePath: string): Promise<boolean> {
		try {
			const status = await git(worktreePath, 'status', '--porcelain');
			return !status.trim();
		} catch {
			return true;
		}
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

	private async resolveRemote(projectPath: string, branchName: string): Promise<string> {
		try {
			const remote = (await git(projectPath, 'config', `branch.${branchName}.remote`)).trim();
			if (remote) return remote;
		} catch {
		}
		return 'origin';
	}

	private async releaseBranchFromOtherWorktree(
		projectPath: string, targetWorktreePath: string, branchName: string,
	): Promise<void> {
		await git(projectPath, 'worktree', 'prune');
		const existing = await this.worktreePathForBranch(projectPath, branchName);
		if (existing && canonicalize(existing) !== canonicalize(targetWorktreePath)) {
			throw new Error(
				`Branch '${branchName}' is already checked out at ${existing}.`
				+ ` Remove that worktree first (git worktree remove "${existing}").`,
			);
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

	async isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean> {
		const mainBranch = await this.getMainBranch(projectPath, configuredBranch);
		if (await this.isAncestorOf(projectPath, branchName, mainBranch)) return true;
		const remoteRef = await this.fetchMainBranch(projectPath, mainBranch);
		const ref = remoteRef ?? mainBranch;
		if (remoteRef && await this.isAncestorOf(projectPath, branchName, remoteRef)) return true;
		return this.isBranchSquashMerged(projectPath, branchName, ref);
	}

	private async isAncestorOf(projectPath: string, branchName: string, mainBranch: string): Promise<boolean> {
		const result = await git(projectPath, 'merge-base', '--is-ancestor', branchName, mainBranch)
			.then(() => true, () => false);
		return result;
	}

	private async fetchMainBranch(projectPath: string, mainBranch: string): Promise<string | null> {
		const hasRemote = await git(projectPath, 'remote').then(out => out.trim().length > 0, () => false);
		if (!hasRemote) return null;
		const remote = await this.resolveRemote(projectPath, mainBranch);
		await git(projectPath, 'fetch', remote, mainBranch);
		return `${remote}/${mainBranch}`;
	}

	private async isBranchSquashMerged(projectPath: string, branchName: string, mainBranch: string): Promise<boolean> {
		const mergeTree = (await git(projectPath, 'merge-tree', '--write-tree', mainBranch, branchName)).trim();
		const mainTree = (await git(projectPath, 'rev-parse', `${mainBranch}^{tree}`)).trim();
		return mergeTree === mainTree;
	}

	async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
		try {
			await git(projectPath, 'worktree', 'remove', worktreePath);
		} catch {
			if (!fs.existsSync(worktreePath)) return;
			fs.rmSync(worktreePath, { recursive: true, force: true });
			await git(projectPath, 'worktree', 'prune');
		}
	}

	async deleteLocalBranch(projectPath: string, branchName: string, configuredBranch?: string): Promise<void> {
		const merged = await this.isBranchMerged(projectPath, branchName, configuredBranch);
		if (!merged) {
			throw new Error(
				`Branch '${branchName}' has unmerged commits.`
				+ ' Merge or force-delete the branch before cleanup.',
			);
		}
		await git(projectPath, 'branch', '-D', branchName);
	}

	async deleteRemoteBranch(projectPath: string, branchName: string): Promise<void> {
		await git(projectPath, 'push', 'origin', '--delete', branchName);
	}
}
