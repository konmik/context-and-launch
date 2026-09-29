import { describe, it, expect, vi } from 'vitest'
import {
  runTicketCleanupChecks,
  type TicketCleanupCheckDeps,
  type TicketCleanupCheckTarget,
} from '../../../src/core/worktree/ticket-cleanup-checks.js'
import type { FindHerdrAgentResult } from '../../../src/core/herdr/herdr-control.js'

const target: TicketCleanupCheckTarget = {
  projectSlug: 'alpha',
  folderName: 'st-1',
  projectPath: '/repo',
  worktreePath: '/wt/st-1',
  branchName: 'st-1',
  configuredMainBranch: 'main',
}

function makeDeps(overrides: Partial<TicketCleanupCheckDeps> = {}): TicketCleanupCheckDeps {
  return {
    worktreeExists: () => true,
    isGitWorktree: () => true,
    getWorktreeOwnership: async () => ({
      kind: 'current-project',
    }),
    isWorktreeClean: async () => true,
    isWorktreeBusy: async () => false,
    localBranchExists: async () => true,
    worktreePathForBranch: async () => undefined,
    isBranchMerged: async () => true,
    hasRemoteBranch: async () => true,
    findHerdrAgent: async (): Promise<FindHerdrAgentResult> => ({
      kind: 'agent',
      paneId: 'w1:p1',
      agentStatus: 'working',
    }),
    ...overrides,
  }
}

describe('runTicketCleanupChecks', () => {
  it('marks every item ready when all predicates are favorable and an agent exists', async () => {
    const findHerdrAgent = vi.fn(
      async (): Promise<FindHerdrAgentResult> => ({
        kind: 'agent',
        paneId: 'w1:p1',
        agentStatus: 'working',
      }),
    )
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        findHerdrAgent,
      }),
    )
    expect(status).toEqual({
      stopHerdrAgent: {
        state: 'ready',
        checks: [
          {
            state: 'passed',
            detail: 'Herdr is reachable',
          },
          {
            state: 'passed',
            detail: 'Task agent found',
          },
        ],
      },
      deleteWorktree: {
        state: 'ready',
        checks: [
          {
            state: 'passed',
            detail: 'Worktree found',
          },
          {
            state: 'passed',
            detail: 'Belongs to this project',
          },
          {
            state: 'passed',
            detail: 'No uncommitted changes',
          },
          {
            state: 'passed',
            detail: 'Worktree is not in use',
          },
        ],
      },
      deleteLocalBranch: {
        state: 'ready',
        checks: [
          {
            state: 'passed',
            detail: 'Local branch found',
          },
          {
            state: 'passed',
            detail: 'Branch is not checked out',
          },
          {
            state: 'passed',
            detail: 'Changes integrated into main branch',
          },
        ],
      },
      deleteRemoteBranch: {
        state: 'ready',
        checks: [
          {
            state: 'passed',
            detail: 'Remote branch found',
          },
        ],
      },
    })
    expect(findHerdrAgent).toHaveBeenCalledWith({
      projectSlug: 'alpha',
      folderName: 'st-1',
    })
  })
  it('blocks stopHerdrAgent with the reason Herdr is unavailable', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        findHerdrAgent: async () => ({
          kind: 'herdr-unavailable',
          reason: 'server-not-running',
          message: 'Herdr is not running.',
        }),
      }),
    )
    expect(status.stopHerdrAgent).toEqual({
      state: 'blocked',
      reason: 'Herdr is not running.',
      checks: [
        {
          state: 'passed',
          detail: 'Herdr is not running.',
        },
      ],
    })
  })
  it("blocks stopHerdrAgent with 'No Herdr agent' when there is no agent", async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        findHerdrAgent: async () => ({
          kind: 'no-agent',
        }),
      }),
    )
    expect(status.stopHerdrAgent).toEqual({
      state: 'disabled',
      reason: 'No Herdr agent',
      checks: [
        {
          state: 'passed',
          detail: 'Herdr is reachable',
        },
        {
          state: 'passed',
          detail: 'No Herdr agent',
        },
      ],
    })
  })
  it("blocks deleteWorktree with 'No worktree' when the worktree is missing", async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        worktreeExists: () => false,
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'disabled',
      reason: 'No worktree',
      checks: [
        {
          state: 'passed',
          detail: 'No worktree',
        },
      ],
    })
  })
  it('blocks deleteWorktree when the worktree has uncommitted changes', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isWorktreeClean: async () => false,
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'blocked',
      reason: 'Worktree has uncommitted changes',
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'passed',
          detail: 'Belongs to this project',
        },
        {
          state: 'blocked',
          detail: 'Worktree has uncommitted changes',
        },
      ],
    })
  })
  it('reports the same foreign-worktree error before cleanup', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        getWorktreeOwnership: async () => ({
          kind: 'different-project',
        }),
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'error',
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'blocked',
          detail: 'Belongs to another project',
        },
      ],
      error: {
        title: 'Cleanup failed',
        description:
          `The saved worktree belongs to a different project: ${target.worktreePath}.` +
          ' Remove it from its original project before retrying.',
      },
    })
  })
  it('keeps deleteWorktree ready when the folder is no longer a git worktree', async () => {
    const isWorktreeClean = vi.fn(async () => true)
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isGitWorktree: () => false,
        isWorktreeClean,
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'ready',
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'passed',
          detail: 'Belongs to this project',
        },
        {
          state: 'passed',
          detail: 'Worktree is not in use',
        },
      ],
    })
    expect(isWorktreeClean).not.toHaveBeenCalled()
  })
  it('mentions the running agent when a busy worktree also has an agent', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isWorktreeBusy: async () => true,
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'blocked',
      reason: 'Worktree is in use by another process\n(a Herdr agent is running in it)',
      warning: true,
      killable: true,
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'passed',
          detail: 'Belongs to this project',
        },
        {
          state: 'passed',
          detail: 'No uncommitted changes',
        },
        {
          state: 'blocked',
          detail: 'Worktree is in use by another process',
        },
      ],
    })
  })
  it('omits the parenthetical when a busy worktree has no agent', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isWorktreeBusy: async () => true,
        findHerdrAgent: async () => ({
          kind: 'no-agent',
        }),
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'blocked',
      reason: 'Worktree is in use by another process',
      warning: true,
      killable: true,
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'passed',
          detail: 'Belongs to this project',
        },
        {
          state: 'passed',
          detail: 'No uncommitted changes',
        },
        {
          state: 'blocked',
          detail: 'Worktree is in use by another process',
        },
      ],
    })
  })
  it("omits the parenthetical when a busy worktree's herdr check errored", async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isWorktreeBusy: async () => true,
        findHerdrAgent: async () => {
          throw new Error('herdr broke')
        },
      }),
    )
    expect(status.deleteWorktree).toEqual({
      state: 'blocked',
      reason: 'Worktree is in use by another process',
      warning: true,
      killable: true,
      checks: [
        {
          state: 'passed',
          detail: 'Worktree found',
        },
        {
          state: 'passed',
          detail: 'Belongs to this project',
        },
        {
          state: 'passed',
          detail: 'No uncommitted changes',
        },
        {
          state: 'blocked',
          detail: 'Worktree is in use by another process',
        },
      ],
    })
  })
  it("disables deleteLocalBranch with 'No local branch' when the branch is missing", async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        localBranchExists: async () => false,
      }),
    )
    expect(status.deleteLocalBranch).toEqual({
      state: 'disabled',
      reason: 'No local branch',
      checks: [
        {
          state: 'passed',
          detail: 'No local branch',
        },
      ],
    })
  })
  it('blocks deleteLocalBranch when the branch has unmerged commits', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isBranchMerged: async () => false,
      }),
    )
    expect(status.deleteLocalBranch).toEqual({
      state: 'blocked',
      reason: 'Branch has unmerged commits',
      warning: true,
      forceDeleteable: true,
      checks: [
        {
          state: 'passed',
          detail: 'Local branch found',
        },
        {
          state: 'passed',
          detail: 'Branch is not checked out',
        },
        {
          state: 'blocked',
          detail: 'Branch has unmerged commits',
        },
      ],
    })
  })
  it("disables deleteRemoteBranch with 'No remote branch' when there is no remote branch", async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        hasRemoteBranch: async () => false,
      }),
    )
    expect(status.deleteRemoteBranch).toEqual({
      state: 'disabled',
      reason: 'No remote branch',
      checks: [
        {
          state: 'passed',
          detail: 'No remote branch',
        },
      ],
    })
  })
  it('isolates a rejecting isBranchMerged to deleteLocalBranch only', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        isBranchMerged: async () => {
          throw new Error('merge check failed')
        },
      }),
    )
    expect(status.deleteLocalBranch.state).toBe('error')
    expect(status.deleteLocalBranch.checks).toEqual([
      {
        state: 'passed',
        detail: 'Local branch found',
      },
      {
        state: 'passed',
        detail: 'Branch is not checked out',
      },
      {
        state: 'error',
        detail: 'Changes integrated into main branch could not be checked',
      },
    ])
    if (status.deleteLocalBranch.state === 'error') {
      expect(status.deleteLocalBranch.error.description).toBe('merge check failed')
    }
    expect(status.stopHerdrAgent.state).toBe('ready')
    expect(status.deleteWorktree.state).toBe('ready')
    expect(status.deleteRemoteBranch.state).toBe('ready')
  })
  it('isolates a throwing findHerdrAgent to stopHerdrAgent without corrupting deleteWorktree', async () => {
    const status = await runTicketCleanupChecks(
      target,
      makeDeps({
        findHerdrAgent: async () => {
          throw new Error('duplicate workspaces')
        },
      }),
    )
    expect(status.stopHerdrAgent.state).toBe('error')
    if (status.stopHerdrAgent.state === 'error') {
      expect(status.stopHerdrAgent.error.description).toBe('duplicate workspaces')
    }
    expect(status.deleteWorktree.state).toBe('ready')
  })
  it('does not call isBranchMerged when the local branch is missing', async () => {
    const isBranchMerged = vi.fn(async () => true)
    await runTicketCleanupChecks(
      target,
      makeDeps({
        localBranchExists: async () => false,
        isBranchMerged,
      }),
    )
    expect(isBranchMerged).not.toHaveBeenCalled()
  })
})
