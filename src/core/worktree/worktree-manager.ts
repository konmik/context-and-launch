import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from '../config/config-paths.js';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

export class WorktreeManager {
	private paths: ConfigPaths;
	private ticketsDirResolver?: (projectSlug: string) => string | undefined;
	private locks = new Map<string, Promise<unknown>>();

	constructor(
		paths: ConfigPaths,
		private readonly commands: CommandTemplateExecutor,
		ticketsDirResolver?: (projectSlug: string) => string | undefined,
	) {
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
			throw new Error(
				`Worktree directory exists but has invalid git metadata: ${worktreeDir}.`
				+ ` Inspect and remove it manually, then try again.`,
			);
		}

		fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

		const localList = await this.commands.execute('worktree.branch.local-list', projectPath, { branch });
		if (localList.trim().length > 0) {
			await this.releaseBranchWorktree(projectPath, worktreeDir, branch);
			await this.commands.execute('worktree.add-existing', projectPath, { worktreeDir, branch });
			return worktreeDir;
		}

		if (await this.tryAdoptRemoteBranch(projectPath, worktreeDir, branch)) {
			return worktreeDir;
		}

		await this.commands.execute('worktree.create-orphan', projectPath,
			{ worktreeDir, branch, message: `init ${branch}` },
		);
		return worktreeDir;
	}

	private async tryAdoptRemoteBranch(projectPath: string, worktreeDir: string, branch: string): Promise<boolean> {
		const remote = await this.defaultRemote(projectPath);
		if (!remote) return false;
		try {
			const remoteHeads = await this.commands.execute(
				'worktree.remote-branch.probe', projectPath, { remote, branch },
			);
			if (remoteHeads.trim().length === 0) return false;
			await this.commands.execute('worktree.adopt-remote', projectPath,
				{ remote, branch, worktreeDir, remoteBranch: `${remote}/${branch}` },
			);
			return true;
		} catch (err) {
			console.warn(`Could not adopt ${remote}/${branch}; creating a local orphan branch instead:`, err);
			return false;
		}
	}

	private async releaseBranchWorktree(projectPath: string, worktreeDir: string, branch: string): Promise<void> {
		await this.commands.execute('worktree.prune', projectPath);
		const existing = await this.worktreePathForBranch(projectPath, branch);
		if (existing && path.resolve(existing) !== path.resolve(worktreeDir)) {
			throw new Error(
				`Branch '${branch}' is already checked out at ${existing}.`
				+ ` Remove that worktree first (git worktree remove "${existing}"), then try again.`,
			);
		}
	}

	private async worktreePathForBranch(projectPath: string, branch: string): Promise<string | null> {
		const out = await this.commands.execute('worktree.list', projectPath);
		let currentPath: string | null = null;
		for (const line of out.split('\n')) {
			if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
			else if (line.trim() === `branch refs/heads/${branch}` && currentPath) return currentPath;
		}
		return null;
	}

	private async defaultRemote(projectPath: string): Promise<string | null> {
		const out = await this.commands.execute('worktree.remote.list', projectPath);
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
