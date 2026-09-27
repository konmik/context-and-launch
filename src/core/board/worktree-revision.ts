export interface WorktreeRevisionStore {
  current(worktreeDir: string): number
  bump(worktreeDir: string): number
}

export function createWorktreeRevisionStore(): WorktreeRevisionStore {
  const revisions = new Map<string, number>()

  function current(worktreeDir: string): number {
    return revisions.get(worktreeDir) ?? 0
  }

  function bump(worktreeDir: string): number {
    const next = current(worktreeDir) + 1
    revisions.set(worktreeDir, next)
    return next
  }

  return {
    current,
    bump,
  }
}
