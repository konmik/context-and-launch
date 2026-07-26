export class WorktreeRevisionStore {
	private revisions = new Map<string, number>();

	current(worktreeDir: string): number {
		return this.revisions.get(worktreeDir) ?? 0;
	}

	bump(worktreeDir: string): number {
		const next = this.current(worktreeDir) + 1;
		this.revisions.set(worktreeDir, next);
		return next;
	}
}
