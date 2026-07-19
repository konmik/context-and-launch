import fs from 'fs';
import path from 'path';
import { ProcessError } from '../shared/errors.js';
import { git } from '../infra/git.js';
import { writeMergeTree } from '../infra/git-merge-tree.js';
import { GitRepository } from '../infra/git-repository.js';

export type SyncResult =
	| { status: 'success' }
	| { status: 'conflict' }
	| { status: 'error'; message: string };

export interface ResolutionPlan {
	/** True when conflicts remain and an agent must resolve them in `scratchDir`. */
	needsAgent: boolean;
	/** The scratch worktree the agent runs in; never the live tickets folder. */
	scratchDir: string;
	/** Exact push command for the agent once the rebase completes. */
	pushCommand: string;
}

export class TicketSyncManager {
	private gitRepo: GitRepository;

	constructor(gitRepo?: GitRepository) {
		this.gitRepo = gitRepo ?? new GitRepository();
	}

	async hasRemote(worktreeDir: string): Promise<boolean> {
		const remotes = (await git(worktreeDir, 'remote')).trim();
		return remotes.length > 0;
	}

	async sync(worktreeDir: string): Promise<SyncResult> {
		try {
			const scratch = this.conflictResolveDir(worktreeDir);
			if (fs.existsSync(scratch)) {
				await this.finalizeResolution(worktreeDir);
				if (fs.existsSync(scratch)) return { status: 'conflict' };
			}
			if (this.gitRepo.hasActiveRebase(worktreeDir)) {
				return { status: 'conflict' };
			}
			await this.commitAll(worktreeDir);

			let upstream: string;
			try {
				upstream = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')).trim();
			} catch (err) {
				const isNoUpstream = err instanceof ProcessError
					&& /no upstream configured/.test(err.output ?? "");
				if (!isNoUpstream) throw err;
				const branch = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
				try {
					await git(worktreeDir, 'push', '-u', 'origin', branch);
					return { status: 'success' };
				} catch (pushErr) {
					const isNonFastForward = pushErr instanceof ProcessError
						&& /non-fast-forward|fetch first/.test(pushErr.output ?? "");
					if (!isNonFastForward) throw pushErr;
					await git(worktreeDir, 'fetch', 'origin');
					await this.commitAll(worktreeDir);
					const localHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
					await git(worktreeDir, 'reset', '--hard', `origin/${branch}`);
					await git(worktreeDir, 'checkout', localHead, '--', '.');
					upstream = `origin/${branch}`;
					await git(worktreeDir, 'branch', '--set-upstream-to', upstream);
				}
			}

			await this.gitRepo.assertSupportsMergeTree(worktreeDir);

			const baseUpstream = (await git(worktreeDir, 'rev-parse', upstream)).trim();
			const squashBase = (await git(worktreeDir, 'merge-base', 'HEAD', baseUpstream)).trim();
			if (await this.countAheadOf(worktreeDir, squashBase) > 1) {
				await git(worktreeDir, 'reset', '--soft', squashBase);
				await this.commitAll(worktreeDir);
			}

			await git(worktreeDir, 'fetch');
			await this.commitAll(worktreeDir);
			const headLocal = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
			const newUpstream = (await git(worktreeDir, 'rev-parse', upstream)).trim();
			const aheadCount = await this.countAheadOf(worktreeDir, baseUpstream);

			if (aheadCount === 0) {
				if (headLocal !== newUpstream) {
					await git(worktreeDir, 'merge', '--ff-only', newUpstream);
				}
				return { status: 'success' };
			}

			const { remote, branch } = this.parseUpstream(upstream);
			if (await this.isAncestor(worktreeDir, newUpstream, 'HEAD')) {
				try {
					await git(worktreeDir, 'push', remote, `HEAD:${branch}`);
				} catch (pushErr) {
					return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
				}
				return { status: 'success' };
			}

			const mergeTree = await writeMergeTree(worktreeDir, 'HEAD', newUpstream);
			if (mergeTree.status === 'conflicted') return { status: 'conflict' };
			const mergedTree = mergeTree.tree;

			const signArgs = await this.commitTreeArgs(worktreeDir);
			const newCommit = (await git(
				worktreeDir, 'commit-tree', ...signArgs, mergedTree, '-p', newUpstream, '-m', 'sync: local changes',
			)).trim();

			try {
				await git(worktreeDir, 'push', remote, `${newCommit}:${branch}`);
			} catch (pushErr) {
				return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
			}

			await this.commitAll(worktreeDir);
			const headAfterPush = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
			if (headAfterPush !== headLocal) {
				return { status: 'conflict' };
			}
			await git(worktreeDir, 'reset', '--hard', newCommit);
			return { status: 'success' };
		} catch (err) {
			return { status: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	private async commitAll(worktreeDir: string): Promise<void> {
		await git(worktreeDir, 'add', '-A');
		const staged = await git(worktreeDir, 'diff', '--cached', '--name-only');
		if (staged.trim()) {
			await this.assertNoConflictMarkers(worktreeDir);
			await git(worktreeDir, 'commit', '-m', 'sync: local changes');
		}
	}

	private async isAncestor(worktreeDir: string, ancestor: string, descendant: string): Promise<boolean> {
		try {
			await git(worktreeDir, 'merge-base', '--is-ancestor', ancestor, descendant);
			return true;
		} catch (err) {
			if (err instanceof ProcessError && err.exitCode === 1) return false;
			throw err;
		}
	}

	private async countAheadOf(worktreeDir: string, baseCommit: string): Promise<number> {
		return parseInt(
			(await git(worktreeDir, 'rev-list', '--count', `${baseCommit}..HEAD`)).trim(), 10,
		);
	}

	private async assertNoConflictMarkers(worktreeDir: string): Promise<void> {
		try {
			await git(worktreeDir, 'diff', '--cached', '--check');
		} catch (err) {
			if (!(err instanceof ProcessError)) throw err;
			// `git diff --check` also fails on benign whitespace errors; only block on
			// leftover conflict markers, which must never be committed.
			if (/conflict marker/i.test(err.output ?? "")) {
				throw new Error(
					'Refusing to commit unresolved conflict markers. Resolve the conflict in the '
					+ 'tickets repository, then sync again.',
				);
			}
		}
	}

	/**
	 * Set up an isolated scratch worktree and start the rebase there, so conflict
	 * markers never touch the live tickets folder. If the rebase applies cleanly
	 * (no real conflict -- e.g. the user retried after the conflict was already
	 * resolved) it is pushed and finalized here, and no agent is needed.
	 */
	async prepareResolution(worktreeDir: string): Promise<ResolutionPlan> {
		const scratch = this.conflictResolveDir(worktreeDir);
		const upstream = (await git(
			worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}',
		)).trim();
		const { remote, branch } = this.parseUpstream(upstream);
		const pushCommand = `git push ${remote} HEAD:${branch}`;

		if (!fs.existsSync(scratch)) {
			await git(worktreeDir, 'worktree', 'add', '--detach', scratch, 'HEAD');
		}
		await git(worktreeDir, 'fetch');

		if (!this.gitRepo.hasActiveRebase(scratch)) {
			try {
				await git(scratch, 'rebase', upstream);
			} catch (err) {
				// A conflict leaves a rebase in progress; anything else is a real failure.
				if (!this.gitRepo.hasActiveRebase(scratch)) {
					await this.removeResolveWorktree(worktreeDir, scratch);
					throw err;
				}
			}
		}

		if (!this.gitRepo.hasActiveRebase(scratch)) {
			await git(scratch, 'push', remote, `HEAD:${branch}`);
			await this.finalizeResolution(worktreeDir);
			return { needsAgent: false, scratchDir: scratch, pushCommand };
		}

		return { needsAgent: true, scratchDir: scratch, pushCommand };
	}

	/**
	 * Once the agent has resolved and pushed, advance the live tree to the pushed
	 * result and remove the scratch worktree. Edits made in the live tree while
	 * the resolution was in progress are replayed onto the pushed result in the
	 * scratch (using the scratch rebase's ORIG_HEAD as the snapshot base, never a
	 * re-merge of the already-rebased commit, which would re-conflict) and pushed
	 * before the live tree advances. A no-op until the resolution is actually
	 * pushed.
	 */
	async finalizeResolution(worktreeDir: string): Promise<boolean> {
		const scratch = this.conflictResolveDir(worktreeDir);
		if (!fs.existsSync(scratch)) return false;
		if (this.gitRepo.hasActiveRebase(scratch)) return false;

		const upstream = (await git(
			worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}',
		)).trim();
		try {
			await git(worktreeDir, 'fetch');
		} catch (err) {
			console.warn(
				'Skipping conflict finalize check: fetch failed:',
				err instanceof Error ? err.message : err,
			);
			return false;
		}
		const scratchHead = (await git(scratch, 'rev-parse', 'HEAD')).trim();
		let upstreamHead = (await git(worktreeDir, 'rev-parse', upstream)).trim();
		if (scratchHead !== upstreamHead) return false;

		await this.commitAll(worktreeDir);
		const headLocal = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		if (headLocal !== upstreamHead) {
			const snapshotBase = (await git(scratch, 'rev-parse', 'ORIG_HEAD')).trim();
			if (headLocal !== snapshotBase) {
				try {
					await git(scratch, 'rebase', '--onto', upstreamHead, snapshotBase, headLocal);
				} catch (err) {
					if (!this.gitRepo.hasActiveRebase(scratch)) throw err;
					return false;
				}
				const { remote, branch } = this.parseUpstream(upstream);
				await git(scratch, 'push', remote, `HEAD:${branch}`);
				upstreamHead = (await git(scratch, 'rev-parse', 'HEAD')).trim();
			}
		}

		await this.commitAll(worktreeDir);
		if ((await git(worktreeDir, 'rev-parse', 'HEAD')).trim() !== headLocal) return false;
		await git(worktreeDir, 'reset', '--hard', upstreamHead);
		await this.removeResolveWorktree(worktreeDir, scratch);
		return true;
	}

	/**
	 * True while an unresolved conflict is pending in the scratch worktree, i.e. its
	 * rebase is still in progress. Once the rebase is resolved the scratch lingers until
	 * finalize removes it, but the conflict is gone, so a bare directory check would keep
	 * reporting a conflict that no longer exists.
	 */
	isResolving(worktreeDir: string): boolean {
		const scratch = this.conflictResolveDir(worktreeDir);
		return fs.existsSync(scratch) && this.gitRepo.hasActiveRebase(scratch);
	}

	async abort(worktreeDir: string): Promise<void> {
		const scratch = this.conflictResolveDir(worktreeDir);
		if (fs.existsSync(scratch)) {
			if (this.gitRepo.hasActiveRebase(scratch)) {
				await git(scratch, 'rebase', '--abort');
			}
			await this.removeResolveWorktree(worktreeDir, scratch);
			return;
		}
		// Recover a stuck legacy rebase left directly in the live tree.
		if (this.gitRepo.hasActiveRebase(worktreeDir)) {
			await git(worktreeDir, 'rebase', '--abort');
		}
	}

	hasActiveRebase(worktreeDir: string): boolean {
		return this.gitRepo.hasActiveRebase(worktreeDir);
	}

	private async commitTreeArgs(worktreeDir: string): Promise<string[]> {
		try {
			const val = (await git(worktreeDir, 'config', '--get', 'commit.gpgsign')).trim();
			return val === 'true' ? ['-S'] : [];
		} catch {
			return [];
		}
	}

	private parseUpstream(upstream: string): { remote: string; branch: string } {
		const slashIndex = upstream.indexOf('/');
		if (slashIndex === -1) return { remote: 'origin', branch: upstream };
		return { remote: upstream.slice(0, slashIndex), branch: upstream.slice(slashIndex + 1) };
	}

	private conflictResolveDir(worktreeDir: string): string {
		const normalized = worktreeDir.replace(/[\\/]+$/, '');
		return path.join(path.dirname(normalized), `${path.basename(normalized)}-conflict-resolve`);
	}

	private async removeResolveWorktree(worktreeDir: string, scratch: string): Promise<void> {
		await git(worktreeDir, 'worktree', 'remove', scratch);
	}
}
