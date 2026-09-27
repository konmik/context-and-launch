import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'
import type { WorktreeRevisionStore } from './worktree-revision.js'

export interface SyncPendingTracker {
  hasPendingChanges(worktreeDir: string): boolean
}

export function createSyncPendingTracker(check: (worktreeDir: string) => boolean, revisions: WorktreeRevisionStore): SyncPendingTracker {
  const cache = new Map<
    string,
    {
      revision: number
      value: boolean
    }
  >()

  function hasPendingChanges(worktreeDir: string): boolean {
    const revision = revisions.current(worktreeDir)
    const cached = cache.get(worktreeDir)
    if (cached && cached.revision === revision) return cached.value
    const value = check(worktreeDir)
    cache.set(worktreeDir, {
      revision,
      value,
    })
    return value
  }

  return {
    hasPendingChanges,
  }
}

export function checkHasPendingChanges(worktreeDir: string, commands: CommandTemplateExecutor): boolean {
  try {
    commands.executeSync('git.sync-pending.tracked-probe', worktreeDir)
  } catch {
    return true
  }
  try {
    const untracked = commands.executeSync('git.sync-pending.untracked', worktreeDir).trim()
    return untracked.length > 0
  } catch {
    return true
  }
}
