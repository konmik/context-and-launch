import { errorPayload } from '../shared/errors.js'
import type { ErrorInfo } from '../shared/errors.js'
import type { FindHerdrAgentResult, HerdrAgentTarget } from '../herdr/herdr-control.js'
import { foreignWorktreeMessage, type WorktreeOwnership } from './agent-worktree.js'

export type CleanupItemKey = 'stopHerdrAgent' | 'deleteWorktree' | 'deleteLocalBranch' | 'deleteRemoteBranch'

export interface CleanupCheckDetail {
  state: 'passed' | 'blocked' | 'error'
  detail: string
}

export interface ReadyCleanupCheckItem {
  state: 'ready'
}

export interface BlockedCleanupCheckItem {
  state: 'blocked'
  reason: string
  warning?: true
  killable?: true
  forceDeleteable?: true
}

export interface ErrorCleanupCheckItem {
  state: 'error'
  error: ErrorInfo
}

type CleanupCheckOutcome = ReadyCleanupCheckItem | BlockedCleanupCheckItem | ErrorCleanupCheckItem

export type CleanupCheckItem = CleanupCheckOutcome & {
  checks: CleanupCheckDetail[]
}

export interface TicketCleanupStatus {
  stopHerdrAgent: CleanupCheckItem
  deleteWorktree: CleanupCheckItem
  deleteLocalBranch: CleanupCheckItem
  deleteRemoteBranch: CleanupCheckItem
}

export interface TicketCleanupOptions {
  stopHerdrAgent: boolean
  deleteWorktree: boolean
  deleteLocalBranch: boolean
  deleteRemoteBranch: boolean
}

export interface TicketCleanupCheckTarget {
  projectSlug: string
  folderName: string
  projectPath: string
  worktreePath: string
  branchName: string
  configuredMainBranch?: string
}

export interface TicketCleanupCheckDeps {
  worktreeExists(worktreePath: string): boolean
  isGitWorktree(worktreePath: string): boolean
  getWorktreeOwnership(projectPath: string, worktreePath: string): Promise<WorktreeOwnership>
  isWorktreeClean(worktreePath: string): Promise<boolean>
  isWorktreeBusy(worktreePath: string): Promise<boolean>
  localBranchExists(projectPath: string, branchName: string): Promise<boolean>
  isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean>
  hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean>
  findHerdrAgent(target: HerdrAgentTarget): Promise<FindHerdrAgentResult>
}

interface RunCleanupCheck {
  <T>(
    label: string,
    operation: () => T | Promise<T>,
    evaluate: (value: T) => CleanupCheckDetail['state'] | undefined,
    describe: (value: T) => string,
  ): Promise<T>
}

async function guard(body: (check: RunCleanupCheck) => Promise<CleanupCheckOutcome>): Promise<CleanupCheckItem> {
  let checks: CleanupCheckDetail[] = []

  function record(state: CleanupCheckDetail['state'] | undefined, detail: string): void {
    if (state !== undefined)
      checks = [
        ...checks,
        {
          state,
          detail,
        },
      ]
  }

  async function run<T>(
    label: string,
    operation: () => T | Promise<T>,
    evaluate: (value: T) => CleanupCheckDetail['state'] | undefined,
    describe: (value: T) => string,
  ): Promise<T> {
    try {
      const value = await operation()
      record(evaluate(value), describe(value))
      return value
    } catch (e) {
      record('error', `${label} could not be checked`)
      throw e
    }
  }

  try {
    const outcome = await body(run)
    return {
      ...outcome,
      checks,
    }
  } catch (e) {
    return {
      state: 'error',
      error: errorPayload(e),
      checks,
    }
  }
}

function predicateState(value: boolean): CleanupCheckDetail['state'] {
  return value ? 'passed' : 'blocked'
}

export async function runTicketCleanupChecks(target: TicketCleanupCheckTarget, deps: TicketCleanupCheckDeps): Promise<TicketCleanupStatus> {
  const stopHerdrAgent = guard(async (check) => {
    const found = await check(
      'Agent service detection',
      () =>
        deps.findHerdrAgent({
          projectSlug: target.projectSlug,
          folderName: target.folderName,
        }),
      () => 'passed',
      (result) => (result.kind === 'herdr-unavailable' ? result.message : 'Agent service available'),
    )
    if (found.kind === 'herdr-unavailable')
      return {
        state: 'blocked',
        reason: found.message,
      }
    const hasAgent = await check(
      'Task agent lookup',
      () => found.kind === 'agent',
      () => 'passed',
      (value) => (value ? 'Task agent found' : 'No Herdr agent'),
    )
    if (!hasAgent)
      return {
        state: 'blocked',
        reason: 'No Herdr agent',
      }
    return {
      state: 'ready',
    }
  })
  const deleteWorktree = guard(async (check) => {
    const exists = await check(
      'Worktree lookup',
      () => deps.worktreeExists(target.worktreePath),
      () => 'passed',
      (value) => (value ? 'Worktree found' : 'No worktree'),
    )
    if (!exists) {
      return {
        state: 'blocked',
        reason: 'No worktree',
      }
    }
    const ownership = await check(
      'Project ownership',
      () => deps.getWorktreeOwnership(target.projectPath, target.worktreePath),
      (value) => (value.kind === 'not-worktree' ? undefined : predicateState(value.kind === 'current-project')),
      (value) => (value.kind === 'current-project' ? 'Belongs to this project' : 'Belongs to another project'),
    )
    if (ownership.kind === 'different-project') {
      return {
        state: 'error',
        error: {
          title: 'Cleanup failed',
          description: foreignWorktreeMessage(target.worktreePath),
        },
      }
    }
    const clean = await check(
      'No uncommitted changes',
      async () => {
        if (!deps.isGitWorktree(target.worktreePath)) return undefined
        return deps.isWorktreeClean(target.worktreePath)
      },
      (value) => (value === undefined ? undefined : predicateState(value)),
      (value) => (value ? 'No uncommitted changes' : 'Worktree has uncommitted changes'),
    )
    if (clean === false) {
      return {
        state: 'blocked',
        reason: 'Worktree has uncommitted changes',
      }
    }
    const busy = await check(
      'Not in use by another process',
      () => deps.isWorktreeBusy(target.worktreePath),
      (value) => predicateState(!value),
      (value) => (value ? 'Worktree is in use by another process' : 'Worktree is not in use'),
    )
    if (busy) {
      const herdr = await stopHerdrAgent
      return {
        state: 'blocked',
        warning: true,
        killable: true,
        reason:
          herdr.state === 'ready'
            ? 'Worktree is in use by another process\n(a Herdr agent is running in it)'
            : 'Worktree is in use by another process',
      }
    }
    return {
      state: 'ready',
    }
  })
  const deleteLocalBranch = guard(async (check) => {
    const exists = await check(
      'Local branch lookup',
      () => deps.localBranchExists(target.projectPath, target.branchName),
      () => 'passed',
      (value) => (value ? 'Local branch found' : 'No local branch'),
    )
    if (!exists) {
      return {
        state: 'blocked',
        reason: 'No local branch',
      }
    }
    const merged = await check(
      'Changes integrated into main branch',
      () => deps.isBranchMerged(target.projectPath, target.branchName, target.configuredMainBranch),
      predicateState,
      (value) => (value ? 'Changes integrated into main branch' : 'Branch has unmerged commits'),
    )
    if (!merged) {
      return {
        state: 'blocked',
        reason: 'Branch has unmerged commits',
        warning: true,
        forceDeleteable: true,
      }
    }
    return {
      state: 'ready',
    }
  })
  const deleteRemoteBranch = guard(async (check) => {
    const exists = await check(
      'Remote branch lookup',
      () => deps.hasRemoteBranch(target.projectPath, target.branchName),
      () => 'passed',
      (value) => (value ? 'Remote branch found' : 'No remote branch'),
    )
    if (!exists) {
      return {
        state: 'blocked',
        reason: 'No remote branch',
      }
    }
    return {
      state: 'ready',
    }
  })
  const [herdr, worktree, local, remote] = await Promise.all([stopHerdrAgent, deleteWorktree, deleteLocalBranch, deleteRemoteBranch])
  return {
    stopHerdrAgent: herdr,
    deleteWorktree: worktree,
    deleteLocalBranch: local,
    deleteRemoteBranch: remote,
  }
}
