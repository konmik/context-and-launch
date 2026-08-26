import fs from 'fs';
import path from 'path';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

function pathsReferToSameEntry(left: string, right: string): boolean {
	if (left === right) return true;
	try {
		const leftStat = fs.statSync(left);
		const rightStat = fs.statSync(right);
		return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
	} catch {
		return false;
	}
}

export class GitRepository {
	constructor(private readonly commands: CommandTemplateExecutor) {}

	async isSameRepository(leftWorktree: string, rightWorktree: string): Promise<boolean> {
		const [leftCommonDir, rightCommonDir] = await Promise.all([
			this.resolveCommonDir(leftWorktree),
			this.resolveCommonDir(rightWorktree),
		]);
		return pathsReferToSameEntry(leftCommonDir, rightCommonDir);
	}

	isWorktree(worktreeDir: string): boolean {
		const dotGit = path.join(worktreeDir, '.git');
		try {
			const stat = fs.statSync(dotGit);
			if (stat.isDirectory()) return true;
			if (!stat.isFile()) return false;
			const content = fs.readFileSync(dotGit, 'utf-8').trim();
			const match = content.match(/^gitdir:\s*(.+)$/);
			return match !== null && fs.existsSync(path.resolve(worktreeDir, match[1]));
		} catch (err: unknown) {
			if (err instanceof Error && 'code' in err
				&& (err as NodeJS.ErrnoException).code === 'ENOENT') return false;
			throw err;
		}
	}

	resolveGitDir(worktreeDir: string): string {
		const dotGit = path.join(worktreeDir, '.git');
		try {
			const stat = fs.statSync(dotGit);
			if (stat.isFile()) {
				const content = fs.readFileSync(dotGit, 'utf-8').trim();
				const match = content.match(/^gitdir:\s*(.+)$/);
				if (match) return path.resolve(worktreeDir, match[1]);
			}
		} catch (err: unknown) {
			if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
				console.warn(`resolveGitDir: unexpected error reading ${dotGit}:`, err);
			}
		}
		return dotGit;
	}

	hasActiveRebase(worktreeDir: string): boolean {
		const gitDir = this.resolveGitDir(worktreeDir);
		return fs.existsSync(path.join(gitDir, 'rebase-merge'))
			|| fs.existsSync(path.join(gitDir, 'rebase-apply'));
	}

	async assertSupportsMergeTree(worktreeDir: string): Promise<void> {
		const out = (await this.commands.execute('git.version', worktreeDir)).trim();
		const m = out.match(/(\d+)\.(\d+)/);
		if (!m) throw new Error(`Could not determine git version from: ${out}`);
		const major = parseInt(m[1], 10);
		const minor = parseInt(m[2], 10);
		if (major < 2 || (major === 2 && minor < 38)) {
			throw new Error(
				`Git ${major}.${minor} is too old: tickets sync requires Git >= 2.38 `
				+ 'for "merge-tree --write-tree". Please upgrade git.',
			);
		}
	}

	private async resolveCommonDir(worktreeDir: string): Promise<string> {
		return (await this.commands.execute('git.common-dir.resolve', worktreeDir)).trim();
	}
}
