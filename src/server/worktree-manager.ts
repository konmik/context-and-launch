import fs from 'fs';
import path from 'path';
import { git } from './git.js';
import type { ConfigPaths } from './config-paths.js';

export class WorktreeManager {
	private paths: ConfigPaths;
	private ticketsDirResolver?: (slug: string) => string | undefined;
	private locks = new Map<string, Promise<unknown>>();

	constructor(paths: ConfigPaths, ticketsDirResolver?: (slug: string) => string | undefined) {
		this.paths = paths;
		this.ticketsDirResolver = ticketsDirResolver;
	}

	private resolveTicketsDir(slug: string): string {
		return this.ticketsDirResolver?.(slug) || this.paths.ticketWorktreeDir(slug);
	}

	async ensureWorktree(projectPath: string, slug: string, branch = 'tickets'): Promise<string> {
		if (!fs.existsSync(projectPath)) {
			throw new Error(`Project path does not exist: ${projectPath}`);
		}

		const canonicalPath = fs.realpathSync(projectPath);

		// Async mutex per canonical project path
		const lockKey = canonicalPath;
		const prev = this.locks.get(lockKey) ?? Promise.resolve();
		const next = prev.then(
			() => this.doEnsureWorktree(canonicalPath, slug, branch),
			() => this.doEnsureWorktree(canonicalPath, slug, branch)
		);
		this.locks.set(lockKey, next);

		return next;
	}

	private async doEnsureWorktree(projectPath: string, slug: string, branch: string): Promise<string> {
		const worktreeDir = this.resolveTicketsDir(slug);

		if (fs.existsSync(worktreeDir) && this.isValidWorktree(worktreeDir)) {
			return worktreeDir;
		}

		if (fs.existsSync(worktreeDir)) {
			fs.rmSync(worktreeDir, { recursive: true, force: true });
			await git(projectPath, 'worktree', 'prune');
		}

		fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

		const localList = await git(projectPath, 'branch', '--list', branch);
		if (localList.trim().length > 0) {
			await git(projectPath, 'worktree', 'add', worktreeDir, branch);
			return worktreeDir;
		}

		if (await this.tryAdoptRemoteBranch(projectPath, worktreeDir, branch)) {
			return worktreeDir;
		}

		await git(projectPath, 'worktree', 'add', '--orphan', '-b', branch, worktreeDir);
		await git(worktreeDir, 'commit', '--allow-empty', '-m', `init ${branch}`);
		return worktreeDir;
	}

	private async tryAdoptRemoteBranch(projectPath: string, worktreeDir: string, branch: string): Promise<boolean> {
		const remote = await this.defaultRemote(projectPath);
		if (!remote) return false;
		try {
			const remoteHeads = await git(projectPath, 'ls-remote', '--heads', remote, branch);
			if (remoteHeads.trim().length === 0) return false;
			await git(projectPath, 'fetch', remote, branch);
			await git(projectPath, 'worktree', 'add', '--track', '-b', branch, worktreeDir, `${remote}/${branch}`);
			return true;
		} catch (err) {
			console.warn(`Could not adopt ${remote}/${branch}; creating a local orphan branch instead:`, err);
			return false;
		}
	}

	private async defaultRemote(projectPath: string): Promise<string | null> {
		const out = await git(projectPath, 'remote');
		const remotes = out.split('\n').map((r) => r.trim()).filter(Boolean);
		if (remotes.includes('origin')) return 'origin';
		return remotes[0] ?? null;
	}

	getWorktreeDir(slug: string): string {
		return this.resolveTicketsDir(slug);
	}

	private isValidWorktree(dir: string): boolean {
		const dotGit = path.join(dir, '.git');
		if (!fs.existsSync(dotGit)) return false;
		const stat = fs.statSync(dotGit);
		if (!stat.isFile()) return false;

		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDir = content.replace(/^gitdir:\s*/, '');
		// git may write forward slashes even on Windows; resolve properly
		const resolved = path.resolve(dir, gitDir);
		if (!fs.existsSync(resolved)) return false;

		// Verify the branch has at least one commit (not in "born" state).
		// A worktree left by a failed initial commit has HEAD pointing to a
		// ref that doesn't exist yet.
		return this.headResolves(resolved);
	}

	private headResolves(gitDir: string): boolean {
		const headPath = path.join(gitDir, 'HEAD');
		if (!fs.existsSync(headPath)) return false;

		const head = fs.readFileSync(headPath, 'utf-8').trim();
		if (!head.startsWith('ref: ')) {
			// Detached HEAD with a direct commit hash -- valid
			return true;
		}

		const ref = head.slice(5); // e.g. "refs/heads/tickets"
		// Resolve ref via commondir (worktrees store shared refs in the main .git)
		const commondirPath = path.join(gitDir, 'commondir');
		const commondir = fs.existsSync(commondirPath)
			? path.resolve(gitDir, fs.readFileSync(commondirPath, 'utf-8').trim())
			: gitDir;

		// Check loose ref
		if (fs.existsSync(path.join(commondir, ref))) return true;

		// Check packed-refs
		const packedRefsPath = path.join(commondir, 'packed-refs');
		if (fs.existsSync(packedRefsPath)) {
			const packedRefs = fs.readFileSync(packedRefsPath, 'utf-8');
			if (packedRefs.includes(` ${ref}\n`) || packedRefs.includes(`\t${ref}\n`)) {
				return true;
			}
		}

		return false;
	}
}
