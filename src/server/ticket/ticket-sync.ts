import fs from 'fs';
import path from 'path';
import { ProcessError } from '../shared/errors.js';
import { git } from '../infra/git.js';
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
		try {
			await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
			return true;
		} catch (err) {
			const isExpectedGitError = err instanceof ProcessError
				&& /no upstream configured|does not point to a branch/.test(err.output);
			if (!isExpectedGitError) throw err;

			const gitDir = this.gitRepo.resolveGitDir(worktreeDir);
			const headNameFile = path.join(gitDir, 'rebase-merge', 'head-name');
			try {
				const ref = fs.readFileSync(headNameFile, 'utf-8').trim();
				const branch = ref.replace(/^refs\/heads\//, '');
				await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`);
				return true;
			} catch (innerErr) {
				// head-name file missing (no active rebase) or branch has no upstream -- both mean no remote
				const isFileNotFound = innerErr instanceof Error
					&& 'code' in innerErr && (innerErr as NodeJS.ErrnoException).code === 'ENOENT';
				const isGitNoUpstream = innerErr instanceof ProcessError
					&& /no upstream configured/.test(innerErr.output);
				if (!isFileNotFound && !isGitNoUpstream) {
					console.warn('hasRemote: unexpected error during rebase-merge upstream check:', innerErr);
				}
				return false;
			}
		}
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
			await git(worktreeDir, 'add', '-A');

			const porcelain = await git(worktreeDir, 'status', '--porcelain');
			if (porcelain.trim()) {
				await this.assertNoConflictMarkers(worktreeDir);
				await git(worktreeDir, 'commit', '-m', 'sync: local changes');
			}

			let upstream: string;
			try {
				upstream = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')).trim();
			} catch (err) {
				const isNoUpstream = err instanceof ProcessError
					&& /no upstream configured/.test(err.output);
				if (!isNoUpstream) throw err;
				try {
					await git(worktreeDir, 'push');
				} catch (pushErr) {
					return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
				}
				return { status: 'success' };
			}

			await this.gitRepo.assertSupportsMergeTree(worktreeDir);

			const baseUpstream = (await git(worktreeDir, 'rev-parse', upstream)).trim();
			const aheadCount = parseInt(
				(await git(worktreeDir, 'rev-list', '--count', `${baseUpstream}..HEAD`)).trim(), 10,
			);
			if (aheadCount > 1) {
				await git(worktreeDir, 'reset', '--soft', baseUpstream);
				await this.assertNoConflictMarkers(worktreeDir);
				await git(worktreeDir, 'commit', '-m', 'sync: local changes');
			}

			await git(worktreeDir, 'fetch');
			const newUpstream = (await git(worktreeDir, 'rev-parse', upstream)).trim();

			if (aheadCount === 0) {
				if (baseUpstream !== newUpstream) {
					await git(worktreeDir, 'reset', '--hard', newUpstream);
				}
				return { status: 'success' };
			}

			let mergedTree: string;
			try {
				mergedTree = (await git(worktreeDir, 'merge-tree', '--write-tree', 'HEAD', newUpstream))
					.trim().split('\n')[0];
			} catch (mergeErr) {
				// merge-tree exits 1 both for a real conflict (CONFLICT lines on stdout) and
				// for genuine failures (stderr, no conflict listing); match the output so an
				// error -- or a timeout, where exitCode is undefined -- is not read as a conflict.
				if (mergeErr instanceof ProcessError && mergeErr.exitCode === 1
					&& /^CONFLICT|Merge conflict/m.test(mergeErr.output)) {
					return { status: 'conflict' };
				}
				return { status: 'error', message: mergeErr instanceof Error ? mergeErr.message : String(mergeErr) };
			}

			const newCommit = (await git(
				worktreeDir, 'commit-tree', mergedTree, '-p', newUpstream, '-m', 'sync: local changes',
			)).trim();

			try {
				const { remote, branch } = this.parseUpstream(upstream);
				await git(worktreeDir, 'push', remote, `${newCommit}:${branch}`);
			} catch (pushErr) {
				return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
			}

			await git(worktreeDir, 'reset', '--hard', newCommit);
			return { status: 'success' };
		} catch (err) {
			return { status: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	private async assertNoConflictMarkers(worktreeDir: string): Promise<void> {
		try {
			await git(worktreeDir, 'diff', '--cached', '--check');
		} catch (err) {
			if (!(err instanceof ProcessError)) throw err;
			// `git diff --check` also fails on benign whitespace errors; only block on
			// leftover conflict markers, which must never be committed.
			if (/conflict marker/i.test(err.output)) {
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
	 * result and remove the scratch worktree. Deterministic fast-forward via
	 * reset, never a re-merge (the local commit was rebased, so merging it again
	 * would re-conflict). A no-op until the resolution is actually pushed.
	 */
	async finalizeResolution(worktreeDir: string): Promise<boolean> {
		const scratch = this.conflictResolveDir(worktreeDir);
		if (!fs.existsSync(scratch)) return false;
		if (this.gitRepo.hasActiveRebase(scratch)) return false;

		const upstream = (await git(
			worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}',
		)).trim();
		await git(worktreeDir, 'fetch');
		const scratchHead = (await git(scratch, 'rev-parse', 'HEAD')).trim();
		const upstreamHead = (await git(worktreeDir, 'rev-parse', upstream)).trim();
		if (scratchHead !== upstreamHead) return false;

		await git(worktreeDir, 'reset', '--hard', upstream);
		await this.removeResolveWorktree(worktreeDir, scratch);
		return true;
	}

	/** True while a conflict resolution is pending in the scratch worktree. */
	isResolving(worktreeDir: string): boolean {
		return fs.existsSync(this.conflictResolveDir(worktreeDir));
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
