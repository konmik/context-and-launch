import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { fromAny, fromPartial } from '@total-typescript/shoehorn'
import type { CommandTemplateExecutor } from '../../../src/core/command-template/command-template-types.js'
import { createFileWatcher, type FileWatcherAdapters } from '../../../src/core/infra/file-watcher.js'

interface FakeWatcher {
  readonly close: Mock<() => Promise<void>>
  on(event: string, callback: (...args: never[]) => void): FakeWatcher
  emit(event: string, ...args: never[]): void
}

function createFakeWatcher(): FakeWatcher {
  const listenersValue = new Map<string, Array<(...args: never[]) => void>>()
  const close = vi.fn(async () => {})

  function on(event: string, callback: (...args: never[]) => void): FakeWatcher {
    const listeners = listenersValue.get(event) ?? []
    listeners.push(callback)
    listenersValue.set(event, listeners)
    return instance
  }

  function emit(event: string, ...args: never[]): void {
    for (const listener of listenersValue.get(event) ?? []) listener(...args)
  }

  const instance: FakeWatcher = {
    get close() {
      return close
    },
    on,
    emit,
  }
  return instance
}

function createHarness(status = ''): HarnessResult {
  const handles: FakeWatcher[] = []
  const ignored: Array<(filePath: string) => boolean> = []
  const commands = fromPartial<CommandTemplateExecutor>({
    execute: vi.fn(),
    executeSync: vi.fn((key: string) => (key === 'git.status' ? status : '')),
    render: vi.fn(),
  })
  const adapters: FileWatcherAdapters = {
    createWatcher: vi.fn((_dir, options) => {
      const handle = createFakeWatcher()
      handles.push(handle)
      ignored.push(fromAny(options?.ignored))
      return handle
    }),
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (timer) => clearTimeout(timer),
  }
  return {
    adapters,
    commands,
    handles,
    ignored,
  }
}

describe('FileWatcher', () => {
  it('releases the previous project when its view switches projects', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    const releaseFirst = watcher.subscribe('/one')
    await releaseFirst()
    const releaseSecond = watcher.subscribe('/two')
    expect(harness.handles[0].close).toHaveBeenCalledOnce()
    expect(harness.handles[1].close).not.toHaveBeenCalled()
    await releaseSecond()
    expect(harness.handles[1].close).toHaveBeenCalledOnce()
  })
  it('keeps a project watched until its last mounted view leaves', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    const releaseFirst = watcher.subscribe('/repo')
    const releaseSecond = watcher.subscribe('/repo')
    expect(harness.adapters.createWatcher).toHaveBeenCalledOnce()
    await releaseFirst()
    await releaseFirst()
    expect(harness.handles[0].close).not.toHaveBeenCalled()
    await releaseSecond()
    expect(harness.handles[0].close).toHaveBeenCalledOnce()
  })
  it('does not revive a watcher when its last view leaves during a mutation', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    const release = watcher.subscribe('/repo')
    await watcher.runWithWatchPaused('/repo', release)
    expect(harness.adapters.createWatcher).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(harness.commands.executeSync).not.toHaveBeenCalled()
  })
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it('creates one watcher per directory and permits additive watches', () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/one')
    watcher.subscribe('/one')
    watcher.subscribe('/two')
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2)
  })
  it('debounces file events, replaces the timer, and reports before and after commit', () => {
    const harness = createHarness(' M task.json')
    const onChange = vi.fn()
    const watcher = createFileWatcher(harness.commands, onChange, harness.adapters)
    watcher.subscribe('/repo', 200)
    harness.handles[0].emit('add')
    vi.advanceTimersByTime(100)
    harness.handles[0].emit('change')
    vi.advanceTimersByTime(199)
    expect(harness.commands.executeSync).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(harness.commands.executeSync).toHaveBeenNthCalledWith(1, 'git.stage-all', '/repo')
    expect(harness.commands.executeSync).toHaveBeenNthCalledWith(2, 'git.status', '/repo')
    expect(harness.commands.executeSync).toHaveBeenNthCalledWith(3, 'git.commit', '/repo', {
      message: 'auto: external changes',
    })
    expect(onChange).toHaveBeenCalledTimes(3)
  })
  it('does not create a redundant commit when staging leaves a clean status', () => {
    const harness = createHarness('')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    harness.handles[0].emit('unlink')
    vi.runAllTimers()
    expect(harness.commands.executeSync).toHaveBeenCalledTimes(2)
    expect(harness.commands.executeSync).not.toHaveBeenCalledWith('git.commit', expect.anything(), expect.anything())
  })
  it('cancels pending work on stop and creates a fresh watcher on rewatch', () => {
    const harness = createHarness(' M task.json')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    harness.handles[0].emit('add')
    watcher.stop('/repo')
    vi.runAllTimers()
    watcher.subscribe('/repo', 10)
    expect(harness.handles[0].close).toHaveBeenCalledOnce()
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2)
    expect(harness.commands.executeSync).not.toHaveBeenCalled()
  })
  it('stopAll closes every watcher and cancels all pending work', () => {
    const harness = createHarness(' M task.json')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/one', 10)
    watcher.subscribe('/two', 10)
    harness.handles[0].emit('add')
    harness.handles[1].emit('add')
    watcher.stopAll()
    vi.runAllTimers()
    expect(harness.handles.every((handle) => handle.close.mock.calls.length === 1)).toBe(true)
    expect(harness.commands.executeSync).not.toHaveBeenCalled()
  })
  it('catches up a non-dot change discovered when the watcher becomes ready', () => {
    const harness = createHarness(' M task.json\n?? nested/new.md')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    harness.handles[0].emit('ready')
    vi.runAllTimers()
    expect(harness.commands.executeSync).toHaveBeenCalledWith('git.commit', '/repo', {
      message: 'auto: external changes',
    })
  })
  it('ignores dot-only ready changes, including quoted and nested paths', () => {
    const harness = createHarness('?? .hidden\n?? ".cache/entry.txt"')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    harness.handles[0].emit('ready')
    vi.runAllTimers()
    expect(harness.commands.executeSync).toHaveBeenCalledOnce()
    expect(harness.commands.executeSync).toHaveBeenCalledWith('git.status', '/repo')
  })
  it('filters dot segments only inside the watched root', () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/parent/.context-launch/repo')
    expect(harness.ignored[0]('/parent/.context-launch/repo/task.json')).toBe(false)
    expect(harness.ignored[0]('/parent/.context-launch/repo/.git/index')).toBe(true)
    expect(harness.ignored[0]('/parent/.context-launch/repo/task/.cache/value')).toBe(true)
  })
  it('logs watcher creation, watcher events, catch-up, commit, and close failures', async () => {
    const harness = createHarness(' M task.json')
    const creationError = new Error('create failed')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(harness.adapters.createWatcher).mockImplementationOnce(() => {
      throw creationError
    })
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    expect(() => watcher.subscribe('/create-error')).toThrow(creationError)
    watcher.subscribe('/repo', 10)
    harness.handles[0].emit('error', fromAny(new Error('watch error')))
    vi.mocked(harness.commands.executeSync).mockImplementationOnce(() => {
      throw new Error('ready failed')
    })
    harness.handles[0].emit('ready')
    harness.handles[0].emit('add')
    vi.mocked(harness.commands.executeSync).mockImplementationOnce(() => {
      throw new Error('commit failed')
    })
    vi.runAllTimers()
    harness.handles[0].close.mockRejectedValueOnce(new Error('close failed'))
    await watcher.stop('/repo')
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('failed to watch'),
        expect.stringContaining('watcher error'),
        expect.stringContaining('catch-up check failed'),
        expect.stringContaining('auto-commit failed'),
        expect.stringContaining('failed to close watcher'),
      ]),
    )
  })
  it('closes the watcher before an exclusive task runs and re-watches afterward', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    const order: string[] = []
    harness.handles[0].close.mockImplementation(async () => {
      order.push('close')
    })
    const result = await watcher.runWithWatchPaused('/repo', () => {
      order.push('task')
      expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(1)
      return 'done'
    })
    expect(result).toBe('done')
    expect(order).toEqual(['close', 'task'])
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2)
  })
  it('re-watches even when the exclusive task throws', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    await expect(
      watcher.runWithWatchPaused('/repo', () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2)
  })
  it('serializes overlapping tasks and defers watch requests until both finish', async () => {
    const harness = createHarness(' M task.json')
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo', 10)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstStarted!: () => void
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    const first = watcher.runWithWatchPaused('/repo', async () => {
      firstStarted()
      await firstGate
    })
    await started
    const secondTask = vi.fn(() => {
      watcher.subscribe('/repo', 10)
      vi.runAllTimers()
      expect(harness.commands.executeSync).not.toHaveBeenCalled()
    })
    const second = watcher.runWithWatchPaused('/repo', secondTask)
    watcher.subscribe('/repo', 10)
    vi.runAllTimers()
    expect(secondTask).not.toHaveBeenCalled()
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(1)
    releaseFirst()
    await Promise.all([first, second])
    expect(secondTask).toHaveBeenCalledOnce()
    expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2)
    vi.runAllTimers()
    expect(harness.commands.executeSync).toHaveBeenCalledWith('git.commit', '/repo', {
      message: 'auto: external changes',
    })
  })
  it('runs an exclusive task without touching watchers when nothing is watched', async () => {
    const harness = createHarness()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    const result = await watcher.runWithWatchPaused('/repo', () => 'ok')
    expect(result).toBe('ok')
    expect(harness.adapters.createWatcher).not.toHaveBeenCalled()
  })
  it('does not run a queued callback after its watcher is removed', () => {
    const harness = createHarness(' M task.json')
    let queuedCallback: (() => void) | undefined
    harness.adapters.setTimer = vi.fn((callback) => {
      queuedCallback = callback
      return fromAny(1)
    })
    harness.adapters.clearTimer = vi.fn()
    const watcher = createFileWatcher(harness.commands, undefined, harness.adapters)
    watcher.subscribe('/repo')
    harness.handles[0].emit('add')
    watcher.stop('/repo')
    queuedCallback?.()
    expect(harness.commands.executeSync).not.toHaveBeenCalled()
  })
})

export interface HarnessResult {
  adapters: FileWatcherAdapters
  commands: CommandTemplateExecutor
  handles: FakeWatcher[]
  ignored: ((filePath: string) => boolean)[]
}
