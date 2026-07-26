import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';
import type { WorktreeRevisionStore } from './worktree-revision.js';

export class SyncPendingTracker {
	private cache = new Map<string, { revision: number; value: boolean }>();

	constructor(
		private readonly check: (worktreeDir: string) => boolean,
		private readonly revisions: WorktreeRevisionStore,
	) {}

	hasPendingChanges(worktreeDir: string): boolean {
		const revision = this.revisions.current(worktreeDir);
		const cached = this.cache.get(worktreeDir);
		if (cached && cached.revision === revision) return cached.value;
		const value = this.check(worktreeDir);
		this.cache.set(worktreeDir, { revision, value });
		return value;
	}
}

export function checkHasPendingChanges(
	worktreeDir: string,
	commands: CommandTemplateExecutor,
): boolean {
	try {
		commands.executeSync('git.sync-pending.tracked-probe', worktreeDir);
	} catch {
		return true;
	}

	try {
		const untracked = commands.executeSync('git.sync-pending.untracked', worktreeDir).trim();
		return untracked.length > 0;
	} catch {
		return true;
	}
}
