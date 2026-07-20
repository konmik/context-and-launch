import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

export class SyncPendingTracker {
	private versions = new Map<string, number>();
	private cache = new Map<string, { version: number; value: boolean }>();

	constructor(private readonly check: (worktreeDir: string) => boolean) {}

	invalidate(worktreeDir: string): void {
		this.versions.set(worktreeDir, this.currentVersion(worktreeDir) + 1);
	}

	hasPendingChanges(worktreeDir: string): boolean {
		const version = this.currentVersion(worktreeDir);
		const cached = this.cache.get(worktreeDir);
		if (cached && cached.version === version) return cached.value;
		const value = this.check(worktreeDir);
		this.cache.set(worktreeDir, { version, value });
		return value;
	}

	private currentVersion(worktreeDir: string): number {
		return this.versions.get(worktreeDir) ?? 0;
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
