import fs from 'fs';
import path from 'path';
import { ProcessError } from './errors.js';
import { git } from './git.js';

export type SyncResult =
	| { status: 'success' }
	| { status: 'conflict' }
	| { status: 'error'; message: string };

export class TicketSyncManager {
	private resolveGitDir(worktreeDir: string): string {
		const dotGit = path.join(worktreeDir, '.git');
		try {
			const stat = fs.statSync(dotGit);
			if (stat.isFile()) {
				const content = fs.readFileSync(dotGit, 'utf-8').trim();
				const match = content.match(/^gitdir:\s*(.+)$/);
				if (match) return path.resolve(worktreeDir, match[1]);
			}
		} catch {
			// fall through
		}
		return dotGit;
	}

	async hasRemote(worktreeDir: string): Promise<boolean> {
		try {
			await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
			return true;
		} catch (err) {
			const isExpectedGitError = err instanceof ProcessError
				&& /no upstream configured|does not point to a branch/.test(err.output);
			if (!isExpectedGitError) throw err;

			const gitDir = this.resolveGitDir(worktreeDir);
			const headNameFile = path.join(gitDir, 'rebase-merge', 'head-name');
			try {
				const ref = fs.readFileSync(headNameFile, 'utf-8').trim();
				const branch = ref.replace(/^refs\/heads\//, '');
				await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`);
				return true;
			} catch {
				return false;
			}
		}
	}

	async sync(worktreeDir: string): Promise<SyncResult> {
		try {
			// Stage all changes
			await git(worktreeDir, 'add', '-A');

			// Check if there is anything to commit
			const porcelain = await git(worktreeDir, 'status', '--porcelain');
			if (porcelain.trim()) {
				await git(worktreeDir, 'commit', '-m', 'sync: local changes');
			}

			// Fetch from remote
			await git(worktreeDir, 'fetch');

			// Get the upstream ref
			let upstream: string;
			try {
				upstream = (await git(worktreeDir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')).trim();
			} catch (err) {
				const isNoUpstream = err instanceof ProcessError
					&& /no upstream configured/.test(err.output);
				if (!isNoUpstream) throw err;
				// No upstream configured; nothing to rebase on, just push
				try {
					await git(worktreeDir, 'push');
				} catch (pushErr) {
					return { status: 'error', message: pushErr instanceof Error ? pushErr.message : String(pushErr) };
				}
				return { status: 'success' };
			}

			// Check if we are behind
			const behindCount = (await git(worktreeDir, 'rev-list', '--count', `HEAD..${upstream}`)).trim();
			if (behindCount === '0') {
				// Not behind, just push local commits if any
				const aheadCount = (await git(worktreeDir, 'rev-list', '--count', `${upstream}..HEAD`)).trim();
				if (aheadCount !== '0') {
					await git(worktreeDir, 'push');
				}
				return { status: 'success' };
			}

			// Rebase on upstream
			try {
				await git(worktreeDir, 'rebase', upstream);
			} catch (rebaseErr) {
				// A real merge conflict leaves a rebase in progress (rebase-merge/
				// rebase-apply). Any other rebase failure (e.g. a refusing
				// pre-rebase hook, untracked files that would be overwritten) leaves
				// no in-progress rebase and must be surfaced rather than mislabeled
				// as a conflict.
				if (this.hasActiveRebase(worktreeDir)) {
					return { status: 'conflict' };
				}
				return { status: 'error', message: rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr) };
			}

			// Push after successful rebase
			await git(worktreeDir, 'push');
			return { status: 'success' };
		} catch (err) {
			return { status: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	async abort(worktreeDir: string): Promise<void> {
		await git(worktreeDir, 'rebase', '--abort');
	}

	hasActiveRebase(worktreeDir: string): boolean {
		const gitDir = this.resolveGitDir(worktreeDir);
		return fs.existsSync(path.join(gitDir, 'rebase-merge'))
			|| fs.existsSync(path.join(gitDir, 'rebase-apply'));
	}
}
