import fs from 'fs';
import path from 'path';

export class GitRepository {
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
}
