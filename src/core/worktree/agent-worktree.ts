import fs from 'fs';
import path from 'path';
import { rename } from 'fs/promises';
import { writeMergeTree } from '../infra/git-merge-tree.js';
import { ProcessError, ValidationError, errorMessage } from '../shared/errors.js';
import { appLog } from '../infra/app-logger.js';
import { resolveAgentWorktreeLocation } from './worktree-naming.js';
import type { LauncherConfigManager } from '../launcher/launcher-config.js';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';


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

export interface SavedWorktreeInfo {
	branchName: string;
	agentWorktreePath: string;
}

export function toSavedWorktreeInfo(
	ticket: { agentWorktreeBranchName?: string; agentWorktreeDir?: string },
): SavedWorktreeInfo | undefined {
	if (ticket.agentWorktreeBranchName && ticket.agentWorktreeDir) {
		return { branchName: ticket.agentWorktreeBranchName, agentWorktreePath: ticket.agentWorktreeDir };
	}
	return undefined;
}

export interface WorktreeResult {
	worktreePath: string;
	branchName: string;
	behindRemote?: true;
}

export interface DirtyWorktreeResult {
	dirtyWorktree: true;
}

export class AgentWorktreeManager {
	constructor(
		private launcherConfig: LauncherConfigManager,
		private readonly commands: CommandTemplateExecutor,
	) {}

	async getMainBranch(projectPath: string, configuredBranch?: string): Promise<string> {
		const trimmed = configuredBranch?.trim();
		if (trimmed) return trimmed;
		for (const branch of ['main', 'master']) {
			const result = await this.commands.execute('git.main-branch.probe', projectPath, { branch });
			if (result.trim()) return branch;
		}
		throw new Error('Neither main nor master branch exists');
	}

	async ensureAgentWorktree(
		projectPath: string,
		projectSlug: string,
		folderName: string,
		options?: { skipDirtyCheck?: boolean },
		configuredBranch?: string,
		savedWorktreeInfo?: SavedWorktreeInfo,
	): Promise<WorktreeResult | DirtyWorktreeResult> {
		const { worktreeRootPath, branchPrefix } = this.launcherConfig.resolveWorktreeSettings(projectSlug);

		const { worktreePath, branchName } = resolveAgentWorktreeLocation(
			folderName,
			{ worktreeRootPath, branchPrefix },
			savedWorktreeInfo && {
				savedWorktreePath: savedWorktreeInfo.agentWorktreePath,
				savedBranchName: savedWorktreeInfo.branchName,
			},
		);
		const mainBranch = await this.getMainBranch(projectPath, configuredBranch);

		const worktreeListOutput = await this.commands.execute('agent-worktree.list', projectPath);
		const normalizedTarget = canonicalize(worktreePath);
		const alreadyExists = worktreeListOutput
			.split('\n')
			.some(line =>
				line.startsWith('worktree ') &&
				canonicalize(line.slice('worktree '.length).trim()) === normalizedTarget
			);

		// Reusing an existing worktree does not touch main, so main's state is irrelevant.
		if (alreadyExists) {
			return { worktreePath, branchName };
		}

		// Reusing an existing branch checks it out without forking from main.
		const branchList = await this.commands.execute('agent-worktree.branch.local-list', projectPath,
			{ branch: branchName },
		);
		if (branchList.trim()) {
			await this.releaseBranchFromOtherWorktree(projectPath, worktreePath, branchName);
			await this.commands.execute(
				'agent-worktree.add-existing', projectPath, { worktreePath, branch: branchName },
			);
			return { worktreePath, branchName };
		}

		// Forking a new worktree from main: only now does main's state matter.
		if (!options?.skipDirtyCheck) {
			const status = await this.commands.execute('agent-worktree.main.status', projectPath);
			if (status.trim()) {
				return { dirtyWorktree: true };
			}
		}

		let behindRemote = false;
		try {
			const behindCount = await this.commands.execute('agent-worktree.behind-upstream.count', projectPath,
				{ range: `${mainBranch}..${mainBranch}@{upstream}` },
			);
			if (parseInt(behindCount.trim(), 10) > 0) {
				behindRemote = true;
			}
		} catch (e) {
			console.warn('Skipping upstream check:', e instanceof Error ? e.message : e);
		}

		await this.commands.execute(
			'agent-worktree.create', projectPath, { branch: branchName, worktreePath, mainBranch },
		);

		return behindRemote ? { worktreePath, branchName, behindRemote } : { worktreePath, branchName };
	}

	/**
	 * `git status --porcelain` reports the answer on stdout and exits 0 whether the
	 * worktree is clean or dirty, so a non-zero exit means no verdict at all. This
	 * guards worktree deletion, so a failed probe must surface rather than resolve
	 * to "clean" and let cleanup destroy uncommitted work.
	 */
	async isWorktreeClean(worktreePath: string): Promise<boolean> {
		const status = await this.commands.execute('agent-worktree.status', worktreePath);
		return !status.trim();
	}

	isGitWorktree(worktreePath: string): boolean {
		return fs.existsSync(path.join(worktreePath, '.git'));
	}

	async hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean> {
		try {
			const output = await this.commands.execute('agent-worktree.remote-branch.probe', projectPath,
				{ branch: branchName },
			);
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
		const key = process.platform === 'darwin'
			? 'agent-worktree.busy.probe.macos'
			: 'agent-worktree.busy.probe.linux';
		try {
			const stdout = await this.commands.execute(key, worktreePath, { worktreePath });
			const lines = stdout.split('\n').filter((line) => line.trim() && !line.startsWith('COMMAND'));
			return lines.length > 0;
		} catch (error) {
			// lsof exits non-zero when it finds nothing open, which is the answer
			// "not busy". A probe that never ran is not an answer, so say so rather
			// than reporting a directory as free because the tool was missing.
			if (!(error instanceof ProcessError && error.kind === 'exited')) {
				appLog('worktree', `busy probe unavailable for ${worktreePath}: ${errorMessage(error)}`);
			}
			return false;
		}
	}

	private async resolveRemote(projectPath: string, branchName: string): Promise<string> {
		try {
			const remote = (await this.commands.execute('agent-worktree.branch.remote', projectPath,
				{ configKey: `branch.${branchName}.remote` },
			)).trim();
			if (remote) return remote;
		} catch {
		}
		return 'origin';
	}

	private async releaseBranchFromOtherWorktree(
		projectPath: string, targetWorktreePath: string, branchName: string,
	): Promise<void> {
		await this.commands.execute('agent-worktree.prune', projectPath);
		const existing = await this.worktreePathForBranch(projectPath, branchName);
		if (existing && canonicalize(existing) !== canonicalize(targetWorktreePath)) {
			throw new Error(
				`Branch '${branchName}' is already checked out at ${existing}.`
				+ ` Remove that worktree first (git worktree remove "${existing}").`,
			);
		}
	}

	private async worktreePathForBranch(projectPath: string, branchName: string): Promise<string | null> {
		const out = await this.commands.execute('agent-worktree.list', projectPath);
		let currentPath: string | null = null;
		for (const line of out.split('\n')) {
			if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
			else if (line.trim() === `branch refs/heads/${branchName}` && currentPath) return currentPath;
		}
		return null;
	}

	async localBranchExists(projectPath: string, branchName: string): Promise<boolean> {
		return this.commands
			.execute('agent-worktree.local-branch.probe', projectPath, { ref: `refs/heads/${branchName}` })
			.then(() => true, () => false);
	}

	async isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean> {
		if (!await this.localBranchExists(projectPath, branchName)) {
			throw new ValidationError(
				`Branch '${branchName}' no longer exists.`
				+ ' It may have been renamed or deleted outside Context & Launch.'
				+ ' Archive without deleting the branch, or update the ticket to point at the current branch.',
			);
		}
		const mainBranch = await this.getMainBranch(projectPath, configuredBranch);
		if (await this.isAncestorOf(projectPath, branchName, mainBranch)) return true;
		const remoteRef = await this.fetchMainBranch(projectPath, mainBranch);
		const ref = remoteRef ?? mainBranch;
		if (remoteRef && await this.isAncestorOf(projectPath, branchName, remoteRef)) return true;
		return this.isBranchSquashMerged(projectPath, branchName, ref);
	}

	private async isAncestorOf(projectPath: string, branchName: string, mainBranch: string): Promise<boolean> {
		const result = await this.commands.execute('agent-worktree.merged.probe', projectPath,
			{ branch: branchName, mainBranch },
		)
			.then(() => true, () => false);
		return result;
	}

	private async fetchMainBranch(projectPath: string, mainBranch: string): Promise<string | null> {
		const hasRemote = await this.commands.execute('agent-worktree.remote.list', projectPath)
			.then((out) => out.trim().length > 0, () => false);
		if (!hasRemote) return null;
		const remote = await this.resolveRemote(projectPath, mainBranch);
		await this.commands.execute('agent-worktree.main.fetch', projectPath, { remote, mainBranch });
		return `${remote}/${mainBranch}`;
	}

	private async isBranchSquashMerged(projectPath: string, branchName: string, mainBranch: string): Promise<boolean> {
		const result = await writeMergeTree(this.commands, 'agent-worktree.merge-tree', projectPath, {
			mainBranch, branch: branchName,
		});
		if (result.status === 'conflicted') return false;
		const mainTree = (await this.commands.execute('agent-worktree.main-tree', projectPath,
			{ treeRef: `${mainBranch}^{tree}` },
		)).trim();
		return result.tree === mainTree;
	}

	async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
		if (fs.existsSync(worktreePath) && !this.isGitWorktree(worktreePath)) {
			fs.rmSync(worktreePath, { recursive: true, force: true });
			await this.commands.execute('agent-worktree.prune', projectPath);
			return;
		}
		try {
			await this.commands.execute('agent-worktree.remove', projectPath, { worktreePath });
		} catch (error) {
			// A worktree whose directory is already gone leaves only a stale
			// registration, and pruning completes the removal. When the directory is
			// still on disk git refused for a reason -- a lock, open files, or
			// uncommitted state -- so deleting it anyway would destroy work the user
			// can still recover. Report why instead.
			if (fs.existsSync(worktreePath)) throw error;
			await this.commands.execute('agent-worktree.prune', projectPath);
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
		await this.commands.execute('agent-worktree.branch.delete-local', projectPath, { branch: branchName });
	}

	async deleteRemoteBranch(projectPath: string, branchName: string): Promise<void> {
		await this.commands.execute('agent-worktree.branch.delete-remote', projectPath, { branch: branchName });
	}
}
