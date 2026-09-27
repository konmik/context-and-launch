import { describe, expect, it } from 'vitest'
import { createHerdrExec } from '../../../src/core/herdr/herdr-exec.js'
import { isHerdrUnavailableError } from '../../../src/core/herdr/herdr-availability.js'
import { createProcessError } from '../../../src/core/shared/errors.js'
import type { CommandTemplateExecutor, CommandTemplateKey } from '../../../src/core/command-template/command-template-types.js'

const SOCKET_FAILURE = createProcessError(
  'Command Template herdr.workspace.list',
  1,
  'Error: Os { code: 2, kind: NotFound, message: "The system cannot find the file specified." }',
  undefined,
  'exited',
)

function executor(handlers: Partial<Record<string, () => Promise<string>>>): ExecutorResult {
  const calls: CommandTemplateKey[] = []
  const commands: CommandTemplateExecutor = {
    execute: async (key) => {
      calls.push(key)
      const handler = handlers[key]
      if (!handler) throw new Error(`unexpected call: ${key}`)
      return handler()
    },
    executeSync: () => {
      throw new Error('not used')
    },
    render: () => {
      throw new Error('not used')
    },
  }
  return {
    executor: commands,
    calls,
  }
}

describe('createHerdrExec', () => {
  it('reports a stopped Herdr server as unavailable', async () => {
    const { executor: commands, calls } = executor({
      'herdr.workspace.list': async () => {
        throw SOCKET_FAILURE
      },
      'herdr.status.server': async () => 'status: not running\nsocket: C:\\Users\\me\\AppData\\Roaming\\herdr\\herdr.sock\n',
    })
    const exec = createHerdrExec(commands)
    await expect(exec('herdr.workspace.list')).rejects.toMatchObject({
      reason: 'server-not-running',
      message: 'Herdr is not running.',
    })
    expect(calls).toEqual(['herdr.workspace.list', 'herdr.status.server'])
  })
  it('keeps the original failure when the Herdr server is running', async () => {
    const { executor: commands } = executor({
      'herdr.workspace.list': async () => {
        throw SOCKET_FAILURE
      },
      'herdr.status.server': async () => 'status: running\npid: 1234\n',
    })
    const exec = createHerdrExec(commands)
    await expect(exec('herdr.workspace.list')).rejects.toBe(SOCKET_FAILURE)
  })
  it('reports an unresolvable Herdr CLI as unavailable without probing', async () => {
    const { executor: commands, calls } = executor({
      'herdr.workspace.list': async () => {
        throw createProcessError('herdr', 127, 'not found', undefined, 'command-not-found')
      },
    })
    const exec = createHerdrExec(commands)
    await expect(exec('herdr.workspace.list')).rejects.toSatisfy(isHerdrUnavailableError)
    expect(calls).toEqual(['herdr.workspace.list'])
  })
  it('reports a Herdr CLI that disappeared before the probe as unavailable', async () => {
    const { executor: commands } = executor({
      'herdr.workspace.list': async () => {
        throw SOCKET_FAILURE
      },
      'herdr.status.server': async () => {
        throw createProcessError('herdr', 127, 'not found', undefined, 'command-not-found')
      },
    })
    const exec = createHerdrExec(commands)
    await expect(exec('herdr.workspace.list')).rejects.toMatchObject({
      reason: 'cli-missing',
    })
  })
  it('keeps a timed-out Herdr command a failure', async () => {
    const timeout = createProcessError('herdr', undefined, undefined, 'Timed out', 'timeout')
    const { executor: commands, calls } = executor({
      'herdr.workspace.list': async () => {
        throw timeout
      },
    })
    const exec = createHerdrExec(commands)
    await expect(exec('herdr.workspace.list')).rejects.toBe(timeout)
    expect(calls).toEqual(['herdr.workspace.list'])
  })
})

export interface ExecutorResult {
  executor: CommandTemplateExecutor
  calls: (
    | 'git.version'
    | 'git.common-dir.resolve'
    | 'git.main-branch.probe'
    | 'git.stage-all'
    | 'git.status'
    | 'git.commit'
    | 'git.sync-pending.tracked-probe'
    | 'git.sync-pending.untracked'
    | 'diff-review.head.resolve'
    | 'diff-review.merge-base.resolve'
    | 'diff-review.tracked.files'
    | 'diff-review.branch.files'
    | 'diff-review.last-commit.files'
    | 'diff-review.untracked.files'
    | 'diff-review.file.read'
    | 'ticket-sync.remote.list'
    | 'ticket-sync.upstream.resolve'
    | 'ticket-sync.branch.current'
    | 'ticket-sync.push.set-upstream'
    | 'ticket-sync.fetch-origin'
    | 'ticket-sync.head.resolve'
    | 'ticket-sync.upstream.repair'
    | 'ticket-sync.ref.resolve'
    | 'ticket-sync.merge-base'
    | 'ticket-sync.reset-soft'
    | 'ticket-sync.fetch'
    | 'ticket-sync.fast-forward'
    | 'ticket-sync.push'
    | 'ticket-sync.merge-tree'
    | 'ticket-sync.commit-tree'
    | 'ticket-sync.reset-hard'
    | 'ticket-sync.staged-files'
    | 'ticket-sync.ancestor.probe'
    | 'ticket-sync.ahead-count'
    | 'ticket-sync.conflict-marker.probe'
    | 'ticket-sync.gpg-signing.read'
    | 'conflict-resolution.upstream.resolve'
    | 'conflict-resolution.scratch.create'
    | 'conflict-resolution.fetch'
    | 'conflict-resolution.rebase'
    | 'conflict-resolution.push'
    | 'conflict-resolution.head.resolve'
    | 'conflict-resolution.snapshot-base.resolve'
    | 'conflict-resolution.local-changes.rebase'
    | 'conflict-resolution.rebase.abort'
    | 'conflict-resolution.scratch.remove'
    | 'worktree.branch.local-list'
    | 'worktree.add-existing'
    | 'worktree.create-orphan'
    | 'worktree.remote.list'
    | 'worktree.remote-branch.probe'
    | 'worktree.adopt-remote'
    | 'worktree.prune'
    | 'worktree.list'
    | 'agent-worktree.list'
    | 'agent-worktree.branch.local-list'
    | 'agent-worktree.add-existing'
    | 'agent-worktree.main.status'
    | 'agent-worktree.behind-upstream.count'
    | 'agent-worktree.create'
    | 'agent-worktree.status'
    | 'agent-worktree.remote-branch.probe'
    | 'agent-worktree.busy.probe.macos'
    | 'agent-worktree.busy.probe.linux'
    | 'agent-worktree.branch.remote'
    | 'agent-worktree.prune'
    | 'agent-worktree.local-branch.probe'
    | 'agent-worktree.merged.probe'
    | 'agent-worktree.remote.list'
    | 'agent-worktree.main.fetch'
    | 'agent-worktree.merge-tree'
    | 'agent-worktree.main-tree'
    | 'agent-worktree.remove'
    | 'agent-worktree.branch.delete-local'
    | 'agent-worktree.locking-processes.windows'
    | 'agent-worktree.branch.delete-remote'
    | 'herdr.status.server'
    | 'herdr.workspace.list'
    | 'herdr.pane.list'
    | 'herdr.agent.list'
    | 'herdr.agent.stop'
    | 'herdr.review-prompt.deliver'
    | 'agent-launch.process-start.windows'
    | 'agent-launch.process-start.macos'
    | 'picker.files.windows'
    | 'picker.files.macos'
    | 'picker.files.linux'
    | 'picker.directory.windows'
    | 'picker.directory.macos'
    | 'picker.directory.linux'
    | 'open.directory.windows'
    | 'open.directory.macos'
    | 'open.directory.linux'
  )[]
}
