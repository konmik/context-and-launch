import fs from 'fs';
import path from 'path';
import { ProcessError } from '../shared/errors.js';
import { git } from '../infra/git.js';
import { GitRepository } from '../infra/git-repository.js';

export type SyncResult =
	| { status: 'success' }
	| { status: 'conflict' }
	| { status: 'error'; message: string };

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
			await git(worktreeDir, 'add', '-A');

			const porcelain = await git(worktreeDir, 'status', '--porcelain');
			if (porcelain.trim()) {
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

			const aheadCount = parseInt(
				(await git(worktreeDir, 'rev-list', '--count', `${upstream}..HEAD`)).trim(), 10,
			);
			if (aheadCount > 1) {
				await git(worktreeDir, 'reset', '--soft', upstream);
				await git(worktreeDir, 'commit', '-m', 'sync: local changes');
			}

			await git(worktreeDir, 'fetch');

			try {
				await git(worktreeDir, 'rebase', upstream);
			} catch (rebaseErr) {
				if (this.gitRepo.hasActiveRebase(worktreeDir)) {
					return { status: 'conflict' };
				}
				return { status: 'error', message: rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr) };
			}

			if (aheadCount > 0) {
				await git(worktreeDir, 'push');
			}
			return { status: 'success' };
		} catch (err) {
			return { status: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	async abort(worktreeDir: string): Promise<void> {
		await git(worktreeDir, 'rebase', '--abort');
	}

	hasActiveRebase(worktreeDir: string): boolean {
		return this.gitRepo.hasActiveRebase(worktreeDir);
	}
}
