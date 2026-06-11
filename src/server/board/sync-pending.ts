import { gitSync } from "../infra/git.js";

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

export function checkHasPendingChanges(worktreeDir: string): boolean {
	try {
		gitSync(worktreeDir, "diff", "--quiet", "@{u}");
	} catch {
		return true;
	}

	try {
		const untracked = gitSync(worktreeDir, "ls-files", "--others", "--exclude-standard").trim();
		return untracked.length > 0;
	} catch {
		return true;
	}
}
