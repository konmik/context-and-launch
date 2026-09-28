import type { ErrorInfo } from '~/core/shared/errors.js'
import type { CleanupCheckItem, CleanupItemKey, TaskCleanupOptions } from '~/core/worktree/task-cleanup-checks.js'

export type { TaskCleanupOptions }

export interface CheckingCleanupItemClientState {
  state: 'checking'
}

export type CleanupItemClientState = CheckingCleanupItemClientState | CleanupCheckItem

export interface TaskCleanupItemStates {
  stopHerdrAgent: CleanupItemClientState
  deleteWorktree: CleanupItemClientState
  deleteLocalBranch: CleanupItemClientState
  deleteRemoteBranch: CleanupItemClientState
}

export function allChecking(): TaskCleanupItemStates {
  return buildStates(() => ({
    state: 'checking',
  }))
}

export function allError(error: ErrorInfo): TaskCleanupItemStates {
  return buildStates(() => ({
    state: 'error',
    error,
    checks: [],
  }))
}

export function noCleanupOptions(): TaskCleanupOptions {
  return buildOptions(() => false)
}

export function singleCleanupOption(key: CleanupItemKey): TaskCleanupOptions {
  return buildOptions((candidate) => candidate === key)
}

function buildStates(make: () => CleanupItemClientState): TaskCleanupItemStates {
  return {
    stopHerdrAgent: make(),
    deleteWorktree: make(),
    deleteLocalBranch: make(),
    deleteRemoteBranch: make(),
  } satisfies TaskCleanupItemStates
}

function buildOptions(value: (key: CleanupItemKey) => boolean): TaskCleanupOptions {
  return {
    stopHerdrAgent: value('stopHerdrAgent'),
    deleteWorktree: value('deleteWorktree'),
    deleteLocalBranch: value('deleteLocalBranch'),
    deleteRemoteBranch: value('deleteRemoteBranch'),
  } satisfies TaskCleanupOptions
}
