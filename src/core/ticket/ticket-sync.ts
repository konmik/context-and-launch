import fs from 'fs';
import path from 'path';
import { AppError, ProcessError } from '../shared/errors.js';
import { writeMergeTree } from '../infra/git-merge-tree.js';
import { GitRepository } from '../infra/git-repository.js';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

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

type ResolutionScratchState = 'absent' | 'linked' | 'orphaned';

export class TicketSyncManager {
	constructor(
		private readonly commands: CommandTemplateExecutor,
		private readonly gitRepo: GitRepository,
	) {}

	async hasRemote(worktreeDir: string): Promise<boolean> {
		const remotes = (await this.commands.execute('ticket-sync.remote.list', worktreeDir)).trim();
		return remotes.length > 0;
	}

	/**
	 * Derive whether syncing the current local and upstream commits would conflict.
	 * This is intentionally computed from Git state so it survives page reloads and
	 * application restarts without a separate conflict flag that can become stale.
	 */
	async detectConflict(worktreeDir: string): Promise<boolean> {
		const scratch = this.conflictResolveDir(worktreeDir);
		const scratchState = this.resolutionScratchState(scratch);
		if (scratchState === 'linked') {
			return this.gitRepo.hasActiveRebase(scratch);
		}
		if (scratchState === 'orphaned') this.discardOrphanedResolutionScratch(scratch);
		if (this.gitRepo.hasActiveRebase(worktreeDir)) return true;

		let upstream: string;
		try {
			upstream = (await this.commands.execute(
				'ticket-sync.upstream.resolve', worktreeDir,
			)).trim();
		} catch (error) {
			const hasNoUpstream = error instanceof ProcessError
				&& /no upstream configured/.test(error.output ?? '');
			if (hasNoUpstream) return false;
			throw error;
		}

		const localHead = (await this.commands.execute(
			'ticket-sync.head.resolve', worktreeDir,
		)).trim();
		const upstreamHead = (await this.resolveRef(worktreeDir, upstream)).trim();
		if (localHead === upstreamHead) return false;
		if (await this.isAncestor(worktreeDir, localHead, upstreamHead)) return false;
		if (await this.isAncestor(worktreeDir, upstreamHead, localHead)) return false;

		await this.gitRepo.assertSupportsMergeTree(worktreeDir);
		const mergeTree = await writeMergeTree(
			this.commands,
			'ticket-sync.merge-tree',
			worktreeDir,
			{ left: localHead, right: upstreamHead },
		);
		return mergeTree.status === 'conflicted';
	}

	async sync(worktreeDir: string): Promise<SyncResult> {
		try {
			const scratch = this.conflictResolveDir(worktreeDir);
			const scratchState = this.resolutionScratchState(scratch);
			if (scratchState === 'linked') {
				const finalized = await this.finalizeResolution(worktreeDir);
				if (!finalized && this.resolutionScratchState(scratch) === 'linked') {
					return { status: 'conflict' };
				}
			} else if (scratchState === 'orphaned') {
				this.discardOrphanedResolutionScratch(scratch);
			}
			if (this.gitRepo.hasActiveRebase(worktreeDir)) {
				return { status: 'conflict' };
			}
			await this.commitAll(worktreeDir);

			let upstream: string;
			try {
				upstream = (await this.commands.execute('ticket-sync.upstream.resolve', worktreeDir)).trim();
			} catch (err) {
				const isNoUpstream = err instanceof ProcessError
					&& /no upstream configured/.test(err.output ?? "");
				if (!isNoUpstream) throw err;
				const branch = (await this.commands.execute('ticket-sync.branch.current', worktreeDir)).trim();
				try {
					await this.commands.execute(
						'ticket-sync.push.set-upstream', worktreeDir, { remote: 'origin', branch },
					);
					return { status: 'success' };
				} catch (pushErr) {
					const isNonFastForward = pushErr instanceof ProcessError
						&& /non-fast-forward|fetch first/.test(pushErr.output ?? "");
					if (!isNonFastForward) throw pushErr;
					await this.commands.execute('ticket-sync.fetch-origin', worktreeDir);
					await this.commitAll(worktreeDir);
					const localHead = (await this.commands.execute(
						'ticket-sync.head.resolve', worktreeDir)).trim();
					upstream = `origin/${branch}`;
					await this.commands.execute('ticket-sync.upstream.repair', worktreeDir,
						{ remoteBranch: upstream, localHead, upstream },
					);
				}
			}

			await this.gitRepo.assertSupportsMergeTree(worktreeDir);

			const baseUpstream = (await this.resolveRef(worktreeDir, upstream)).trim();
			const squashBase = (await this.commands.execute('ticket-sync.merge-base', worktreeDir,
				{ left: 'HEAD', right: baseUpstream },
			)).trim();
			if (await this.countAheadOf(worktreeDir, squashBase) > 1) {
				await this.commands.execute('ticket-sync.reset-soft', worktreeDir, { ref: squashBase });
				await this.commitAll(worktreeDir);
			}

			await this.commands.execute('ticket-sync.fetch', worktreeDir);
			await this.commitAll(worktreeDir);
			const headLocal = (await this.commands.execute('ticket-sync.head.resolve', worktreeDir)).trim();
			const newUpstream = (await this.resolveRef(worktreeDir, upstream)).trim();
			const aheadCount = await this.countAheadOf(worktreeDir, baseUpstream);

			if (aheadCount === 0) {
				if (headLocal !== newUpstream) {
					await this.commands.execute('ticket-sync.fast-forward', worktreeDir, { ref: newUpstream });
				}
				return { status: 'success' };
			}

			const { remote, branch } = this.parseUpstream(upstream);
			if (await this.isAncestor(worktreeDir, newUpstream, 'HEAD')) {
				try {
					await this.commands.execute('ticket-sync.push', worktreeDir, { remote, refspec: `HEAD:${branch}` });
				} catch (pushErr) {
					return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
				}
				return { status: 'success' };
			}

			const mergeTree = await writeMergeTree(this.commands, 'ticket-sync.merge-tree', worktreeDir, {
				left: 'HEAD', right: newUpstream,
			});
			if (mergeTree.status === 'conflicted') return { status: 'conflict' };
			const mergedTree = mergeTree.tree;

			const signArgs = await this.commitTreeArgs(worktreeDir);
			const newCommit = (await this.commands.execute('ticket-sync.commit-tree', worktreeDir,
				{ signArgs, tree: mergedTree, parent: newUpstream, message: 'sync: local changes' },
			)).trim();

			try {
				await this.commands.execute(
					'ticket-sync.push', worktreeDir, { remote, refspec: `${newCommit}:${branch}` },
				);
			} catch (pushErr) {
				return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
			}

			await this.commitAll(worktreeDir);
			const headAfterPush = (await this.commands.execute(
				'ticket-sync.head.resolve', worktreeDir)).trim();
			if (headAfterPush !== headLocal) {
				return { status: 'conflict' };
			}
			await this.commands.execute('ticket-sync.reset-hard', worktreeDir, { ref: newCommit });
			return { status: 'success' };
		} catch (err) {
			return { status: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	private async commitAll(worktreeDir: string): Promise<void> {
		await this.commands.execute('git.stage-all', worktreeDir);
		const staged = await this.commands.execute('ticket-sync.staged-files', worktreeDir);
		if (staged.trim()) {
			await this.assertNoConflictMarkers(worktreeDir);
			await this.commands.execute('git.commit', worktreeDir, { message: 'sync: local changes' });
		}
	}

	private async isAncestor(worktreeDir: string, ancestor: string, descendant: string): Promise<boolean> {
		try {
			await this.commands.execute('ticket-sync.ancestor.probe', worktreeDir, { ancestor, descendant });
			return true;
		} catch (err) {
			if (err instanceof ProcessError && err.exitedWith(1)) return false;
			throw err;
		}
	}

	private async countAheadOf(worktreeDir: string, baseCommit: string): Promise<number> {
		return parseInt(
			(await this.commands.execute(
				'ticket-sync.ahead-count', worktreeDir, { range: `${baseCommit}..HEAD` },
			)).trim(), 10,
		);
	}

	private async assertNoConflictMarkers(worktreeDir: string): Promise<void> {
		try {
			await this.commands.execute('ticket-sync.conflict-marker.probe', worktreeDir);
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
		const upstream = (await this.commands.execute(
			'conflict-resolution.upstream.resolve', worktreeDir)).trim();
		const { remote, branch } = this.parseUpstream(upstream);
		const pushCommand = this.commands.render('conflict-resolution.push', { remote, refspec: `HEAD:${branch}` });

		let scratchState = this.resolutionScratchState(scratch);
		if (scratchState === 'orphaned') {
			if (!this.discardOrphanedResolutionScratch(scratch)) {
				throw new AppError(
					`Cannot prepare conflict resolution while ${scratch} is in use. `
					+ 'Close the previous conflict-resolution terminal and try again.',
				);
			}
			scratchState = 'absent';
		}
		if (scratchState === 'absent') {
			await this.commands.execute('conflict-resolution.scratch.create', worktreeDir, { scratch, ref: 'HEAD' });
		}
		await this.commands.execute('conflict-resolution.fetch', worktreeDir);

		if (!this.gitRepo.hasActiveRebase(scratch)) {
			try {
				await this.commands.execute('conflict-resolution.rebase', scratch, { upstream });
			} catch (err) {
				// A conflict leaves a rebase in progress; anything else is a real failure.
				if (!this.gitRepo.hasActiveRebase(scratch)) {
					await this.removeResolveWorktree(worktreeDir, scratch);
					throw err;
				}
			}
		}

		if (!this.gitRepo.hasActiveRebase(scratch)) {
			await this.commands.execute('conflict-resolution.push', scratch, { remote, refspec: `HEAD:${branch}` });
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
		const scratchState = this.resolutionScratchState(scratch);
		if (scratchState === 'absent') return false;
		if (scratchState === 'orphaned') {
			this.discardOrphanedResolutionScratch(scratch);
			return false;
		}
		if (this.gitRepo.hasActiveRebase(scratch)) return false;

		const upstream = (await this.commands.execute(
			'conflict-resolution.upstream.resolve', worktreeDir)).trim();
		try {
			await this.commands.execute('conflict-resolution.fetch', worktreeDir);
		} catch (err) {
			console.warn(
				'Skipping conflict finalize check: fetch failed:',
				err instanceof Error ? err.message : err,
			);
			return false;
		}
		const scratchHead = (await this.commands.execute('conflict-resolution.head.resolve', scratch)).trim();
		let upstreamHead = (await this.resolveRef(worktreeDir, upstream)).trim();
		if (scratchHead !== upstreamHead) return false;

		await this.commitAll(worktreeDir);
		const headLocal = (await this.commands.execute(
			'conflict-resolution.head.resolve', worktreeDir)).trim();
		if (headLocal !== upstreamHead) {
			const snapshotBase = (await this.commands.execute(
				'conflict-resolution.snapshot-base.resolve', scratch)).trim();
			if (headLocal !== snapshotBase) {
				try {
					await this.commands.execute('conflict-resolution.local-changes.rebase', scratch,
						{ upstream: upstreamHead, snapshotBase, localHead: headLocal },
					);
				} catch (err) {
					if (!this.gitRepo.hasActiveRebase(scratch)) throw err;
					return false;
				}
				const { remote, branch } = this.parseUpstream(upstream);
				await this.commands.execute('conflict-resolution.push', scratch, { remote, refspec: `HEAD:${branch}` });
				upstreamHead = (await this.commands.execute(
					'conflict-resolution.head.resolve', scratch)).trim();
			}
		}

		await this.commitAll(worktreeDir);
		const currentHead = await this.commands.execute(
			'conflict-resolution.head.resolve', worktreeDir);
		if (currentHead.trim() !== headLocal) return false;
		await this.commands.execute('ticket-sync.reset-hard', worktreeDir, { ref: upstreamHead });
		try {
			await this.removeResolveWorktree(worktreeDir, scratch);
		} catch (error) {
			// The live Worktree already points at the pushed resolution. Scratch
			// cleanup is a disposable follow-up and must not roll that successful
			// state transition back into a page-load failure. Git for Windows can
			// unregister and empty the scratch before failing to delete its locked
			// directory; repair that partial result when possible and retry later
			// otherwise.
			if (this.resolutionScratchState(scratch) === 'orphaned') {
				this.discardOrphanedResolutionScratch(scratch);
			}
			console.warn(
				`Conflict resolution restored; scratch cleanup deferred for ${scratch}:`,
				error instanceof Error ? error.message : error,
			);
		}
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
		return this.resolutionScratchState(scratch) === 'linked'
			&& this.gitRepo.hasActiveRebase(scratch);
	}

	async abort(worktreeDir: string): Promise<void> {
		const scratch = this.conflictResolveDir(worktreeDir);
		const scratchState = this.resolutionScratchState(scratch);
		if (scratchState === 'orphaned') {
			if (!this.discardOrphanedResolutionScratch(scratch)) {
				throw new AppError(
					`Cannot clean up conflict resolution while ${scratch} is in use. `
					+ 'Close the conflict-resolution terminal and try again.',
				);
			}
			return;
		}
		if (scratchState === 'linked') {
			if (this.gitRepo.hasActiveRebase(scratch)) {
				await this.commands.execute('conflict-resolution.rebase.abort', scratch);
			}
			await this.removeResolveWorktree(worktreeDir, scratch);
			return;
		}
		// Recover a stuck legacy rebase left directly in the live tree.
		if (this.gitRepo.hasActiveRebase(worktreeDir)) {
			await this.commands.execute('conflict-resolution.rebase.abort', worktreeDir);
		}
	}

	hasActiveRebase(worktreeDir: string): boolean {
		return this.gitRepo.hasActiveRebase(worktreeDir);
	}

	private async commitTreeArgs(worktreeDir: string): Promise<string[]> {
		try {
			const val = (await this.commands.execute(
				'ticket-sync.gpg-signing.read', worktreeDir)).trim();
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

	private resolutionScratchState(scratch: string): ResolutionScratchState {
		if (!fs.existsSync(scratch)) return 'absent';
		return this.gitRepo.isWorktree(scratch) ? 'linked' : 'orphaned';
	}

	private discardOrphanedResolutionScratch(scratch: string): boolean {
		try {
			fs.rmSync(scratch, {
				recursive: true,
				force: true,
				maxRetries: 3,
				retryDelay: 100,
			});
			return !fs.existsSync(scratch);
		} catch (error) {
			console.warn(
				`Could not remove orphaned conflict-resolution directory ${scratch}:`,
				error instanceof Error ? error.message : error,
			);
			return false;
		}
	}

	private resolveRef(worktreeDir: string, ref: string): Promise<string> {
		return this.commands.execute('ticket-sync.ref.resolve', worktreeDir, { ref });
	}

	private async removeResolveWorktree(worktreeDir: string, scratch: string): Promise<void> {
		await this.commands.execute('conflict-resolution.scratch.remove', worktreeDir, { scratch });
	}
}
