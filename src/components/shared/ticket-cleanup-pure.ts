import type { ErrorInfo } from '~/core/shared/errors.js'
import type { CleanupCheckItem, CleanupItemKey, TicketCleanupOptions } from '~/core/worktree/ticket-cleanup-checks.js'

export type { TicketCleanupOptions }

export interface CheckingCleanupItemClientState {
  state: 'checking'
}

export type CleanupItemClientState = CheckingCleanupItemClientState | CleanupCheckItem

export interface TicketCleanupItemStates {
  stopHerdrAgent: CleanupItemClientState
  deleteWorktree: CleanupItemClientState
  deleteLocalBranch: CleanupItemClientState
  deleteRemoteBranch: CleanupItemClientState
}

export function allChecking(): TicketCleanupItemStates {
  return buildStates(() => ({
    state: 'checking',
  }))
}

export function allError(error: ErrorInfo): TicketCleanupItemStates {
  return buildStates(() => ({
    state: 'error',
    error,
    checks: [],
  }))
}

export function noCleanupOptions(): TicketCleanupOptions {
  return buildOptions(() => false)
}

export function singleCleanupOption(key: CleanupItemKey): TicketCleanupOptions {
  return buildOptions((candidate) => candidate === key)
}

function buildStates(make: () => CleanupItemClientState): TicketCleanupItemStates {
  return {
    stopHerdrAgent: make(),
    deleteWorktree: make(),
    deleteLocalBranch: make(),
    deleteRemoteBranch: make(),
  } satisfies TicketCleanupItemStates
}

function buildOptions(value: (key: CleanupItemKey) => boolean): TicketCleanupOptions {
  return {
    stopHerdrAgent: value('stopHerdrAgent'),
    deleteWorktree: value('deleteWorktree'),
    deleteLocalBranch: value('deleteLocalBranch'),
    deleteRemoteBranch: value('deleteRemoteBranch'),
  } satisfies TicketCleanupOptions
}
