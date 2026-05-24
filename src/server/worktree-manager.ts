import fs from 'fs';
import path from 'path';
import os from 'os';
import { git } from './git.js';

export class WorktreeManager {
	private configDir: string;
	private ticketsDir: string;
	private locks = new Map<string, Promise<unknown>>();

	constructor(configDir?: string) {
		this.configDir = configDir ?? path.join(os.homedir(), '.ai-stages');
		this.ticketsDir = path.join(this.configDir, 'tickets');
	}

	async ensureWorktree(projectPath: string, slug: string): Promise<string> {
		if (!fs.existsSync(projectPath)) {
			throw new Error(`Project path does not exist: ${projectPath}`);
		}

		const canonicalPath = fs.realpathSync(projectPath);

		// Async mutex per canonical project path
		const lockKey = canonicalPath;
		const prev = this.locks.get(lockKey) ?? Promise.resolve();
		const next = prev.then(
			() => this.doEnsureWorktree(canonicalPath, slug),
			() => this.doEnsureWorktree(canonicalPath, slug)
		);
		this.locks.set(lockKey, next);

		return next;
	}

	private async doEnsureWorktree(projectPath: string, slug: string): Promise<string> {
		this.requireSafeSlug(slug);
		const worktreeDir = path.join(this.ticketsDir, slug);

		if (fs.existsSync(worktreeDir) && this.isValidWorktree(worktreeDir)) {
			return worktreeDir;
		}

		if (fs.existsSync(worktreeDir)) {
			fs.rmSync(worktreeDir, { recursive: true, force: true });
			await git(projectPath, 'worktree', 'prune');
		}

		fs.mkdirSync(this.ticketsDir, { recursive: true });

		const worktreeBranch = `ai-stages--${slug}`;
		const branchList = await git(projectPath, 'branch', '--list', worktreeBranch);
		const branchExists = branchList.trim().length > 0;
		const orphanList = await git(projectPath, 'branch', '--list', 'ai-stages');
		const orphanExists = orphanList.trim().length > 0;

		if (branchExists) {
			await git(projectPath, 'worktree', 'add', worktreeDir, worktreeBranch);
		} else if (orphanExists) {
			await git(projectPath, 'worktree', 'add', '-b', worktreeBranch, worktreeDir, 'ai-stages');
		} else {
			await git(projectPath, 'worktree', 'add', '--orphan', '-b', 'ai-stages', worktreeDir);
			await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init ai-stages');
			if (worktreeBranch !== 'ai-stages') {
				await git(projectPath, 'worktree', 'remove', worktreeDir);
				await git(
					projectPath,
					'worktree',
					'add',
					'-b',
					worktreeBranch,
					worktreeDir,
					'ai-stages'
				);
			}
		}

		return worktreeDir;
	}

	getWorktreeDir(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.ticketsDir, slug);
	}

	private requireSafeSlug(slug: string): void {
		if (
			slug === '.' ||
			slug === '..' ||
			slug.includes('/') ||
			slug.includes('\\') ||
			slug.includes('\0')
		) {
			throw new Error(`Invalid slug: ${slug}`);
		}
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

		const ref = head.slice(5); // e.g. "refs/heads/ai-stages"
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
