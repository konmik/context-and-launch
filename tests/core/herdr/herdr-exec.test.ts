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
  const handlersByKey = new Map(Object.entries(handlers))
  const calls: CommandTemplateKey[] = []
  const commands: CommandTemplateExecutor = {
    execute: async (key) => {
      calls.push(key)
      const handler = handlersByKey.get(key)
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
  calls: CommandTemplateKey[]
}
