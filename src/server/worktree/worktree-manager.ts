import fs from 'fs';
import path from 'path';
import { git } from '../infra/git.js';
import type { ConfigPaths } from '../config/config-paths.js';

export class WorktreeManager {
	private paths: ConfigPaths;
	private ticketsDirResolver?: (projectSlug: string) => string | undefined;
	private locks = new Map<string, Promise<unknown>>();

	constructor(paths: ConfigPaths, ticketsDirResolver?: (projectSlug: string) => string | undefined) {
		this.paths = paths;
		this.ticketsDirResolver = ticketsDirResolver;
	}

	private resolveTicketsDir(projectSlug: string): string {
		return this.ticketsDirResolver?.(projectSlug) || this.paths.ticketWorktreeDir(projectSlug);
	}

	async ensureWorktree(projectPath: string, projectSlug: string, branch = 'tickets'): Promise<string> {
		if (!fs.existsSync(projectPath)) {
			throw new Error(`Project path does not exist: ${projectPath}`);
		}

		const canonicalPath = fs.realpathSync(projectPath);

		const lockKey = canonicalPath;
		const prev = this.locks.get(lockKey) ?? Promise.resolve();
		const next = prev.then(
			() => this.doEnsureWorktree(canonicalPath, projectSlug, branch),
			() => this.doEnsureWorktree(canonicalPath, projectSlug, branch)
		);
		this.locks.set(lockKey, next);

		return next;
	}

	private async doEnsureWorktree(projectPath: string, projectSlug: string, branch: string): Promise<string> {
		const worktreeDir = this.resolveTicketsDir(projectSlug);

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
			await this.releaseBranchWorktree(projectPath, worktreeDir, branch);
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

	private async releaseBranchWorktree(projectPath: string, worktreeDir: string, branch: string): Promise<void> {
		await git(projectPath, 'worktree', 'prune');
		const existing = await this.worktreePathForBranch(projectPath, branch);
		if (existing && path.resolve(existing) !== path.resolve(worktreeDir)) {
			console.warn(
			`Branch '${branch}' is checked out at ${existing}; removing that worktree to use ${worktreeDir}.`,
		);
			await git(projectPath, 'worktree', 'remove', '--force', existing);
		}
	}

	private async worktreePathForBranch(projectPath: string, branch: string): Promise<string | null> {
		const out = await git(projectPath, 'worktree', 'list', '--porcelain');
		let currentPath: string | null = null;
		for (const line of out.split('\n')) {
			if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
			else if (line.trim() === `branch refs/heads/${branch}` && currentPath) return currentPath;
		}
		return null;
	}

	private async defaultRemote(projectPath: string): Promise<string | null> {
		const out = await git(projectPath, 'remote');
		const remotes = out.split('\n').map((r) => r.trim()).filter(Boolean);
		if (remotes.includes('origin')) return 'origin';
		return remotes[0] ?? null;
	}

	getWorktreeDir(projectSlug: string): string {
		return this.resolveTicketsDir(projectSlug);
	}

	private isValidWorktree(dir: string): boolean {
		const dotGit = path.join(dir, '.git');
		if (!fs.existsSync(dotGit)) return false;
		const stat = fs.statSync(dotGit);
		if (!stat.isFile()) return false;

		const content = fs.readFileSync(dotGit, 'utf-8').trim();
		const gitDir = content.replace(/^gitdir:\s*/, '');
		const resolved = path.resolve(dir, gitDir);
		if (!fs.existsSync(resolved)) return false;

		return this.headResolves(resolved);
	}

	private headResolves(gitDir: string): boolean {
		const headPath = path.join(gitDir, 'HEAD');
		if (!fs.existsSync(headPath)) return false;

		const head = fs.readFileSync(headPath, 'utf-8').trim();
		if (!head.startsWith('ref: ')) {
			return true;
		}

		const ref = head.slice(5);
		const commondirPath = path.join(gitDir, 'commondir');
		const commondir = fs.existsSync(commondirPath)
			? path.resolve(gitDir, fs.readFileSync(commondirPath, 'utf-8').trim())
			: gitDir;

		if (fs.existsSync(path.join(commondir, ref))) return true;

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
