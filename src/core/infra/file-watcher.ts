import path from 'path'
import chokidar from 'chokidar'
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'

type WatcherEvent = 'ready' | 'error' | 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FileWatcherHandle {
  on(event: 'ready', callback: () => void): FileWatcherHandle
  on(event: 'error', callback: (cause: unknown) => void): FileWatcherHandle
  on(event: Exclude<WatcherEvent, 'ready' | 'error'>, callback: () => void): FileWatcherHandle
  close(): Promise<void>
}

export interface FileWatcherAdapters {
  createWatcher(worktreeDir: string, options: Parameters<typeof chokidar.watch>[1]): FileWatcherHandle
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimer(timer: ReturnType<typeof setTimeout>): void
}

const DEFAULT_ADAPTERS: FileWatcherAdapters = {
  createWatcher: (worktreeDir, options) => chokidar.watch(worktreeDir, options),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
}

const DEFAULT_DEBOUNCE_MS = 2000

function hasDotSegment(relativePath: string): boolean {
  return relativePath.split(/[/\\]/).some((segment) => segment.startsWith('.'))
}

function isDotPathInside(worktreeDir: string, filePath: string): boolean {
  return hasDotSegment(path.relative(worktreeDir, filePath))
}

function statusEntryPath(statusLine: string): string | undefined {
  const entry = statusLine.slice(3)
  if (!entry) return undefined
  const renameParts = entry.split(' -> ')
  return renameParts[renameParts.length - 1].replace(/^"(.*)"$/, '$1')
}

interface WatcherState {
  watcher: FileWatcherHandle
  timer: ReturnType<typeof setTimeout> | null
  debounceMs: number
  scheduleCommit: () => void
}

interface PausedWatch {
  debounceMs?: number
  pending: number
  tail: Promise<void>
}

export interface FileWatcher {
  subscribe(worktreeDir: string, debounceMs?: number): () => Promise<void>
  stop(worktreeDir: string): Promise<void>
  stopAll(): Promise<void>
  runWithWatchPaused<T>(worktreeDir: string, task: () => T | Promise<T>): Promise<T>
}

export function createFileWatcher(
  commands: CommandTemplateExecutor,
  onWorktreeChange?: (worktreeDir: string) => void,
  adapters: FileWatcherAdapters = DEFAULT_ADAPTERS,
  defaultDebounceMs: number = DEFAULT_DEBOUNCE_MS,
): FileWatcher {
  const watchers = new Map<string, WatcherState>()
  const pausedWatches = new Map<string, PausedWatch>()
  const subscribers = new Map<string, Set<symbol>>()

  function subscribe(worktreeDir: string, debounceMs?: number): () => Promise<void> {
    const token = Symbol()
    const owners = subscribers.get(worktreeDir) ?? new Set<symbol>()
    owners.add(token)
    subscribers.set(worktreeDir, owners)
    try {
      watch(worktreeDir, debounceMs)
    } catch (error) {
      owners.delete(token)
      if (owners.size === 0) subscribers.delete(worktreeDir)
      throw error
    }
    return async () => {
      if (!owners.delete(token) || subscribers.get(worktreeDir) !== owners) return
      if (owners.size === 0) await stop(worktreeDir)
    }
  }

  function watch(worktreeDir: string, debounceMs: number = defaultDebounceMs): void {
    const paused = pausedWatches.get(worktreeDir)
    if (paused) {
      paused.debounceMs = debounceMs
      return
    }
    if (watchers.has(worktreeDir)) return
    let watcher: FileWatcherHandle
    try {
      watcher = adapters.createWatcher(worktreeDir, {
        ignoreInitial: true,
        ignored: (filePath: string) => isDotPathInside(worktreeDir, filePath),
        persistent: true,
        usePolling: process.platform === 'win32',
        depth: 10,
      })
    } catch (err) {
      console.warn(`FileWatcher: failed to watch ${worktreeDir}:`, err)
      throw err
    }
    const debouncedCommit = () => {
      const current = watchers.get(worktreeDir)
      if (!current) return
      if (current.timer) adapters.clearTimer(current.timer)
      current.timer = adapters.setTimer(() => {
        if (!watchers.has(worktreeDir)) return
        try {
          commands.executeSync('git.stage-all', worktreeDir)
          const status = commands.executeSync('git.status', worktreeDir)
          if (status.trim()) {
            commands.executeSync('git.commit', worktreeDir, {
              message: 'auto: external changes',
            })
          }
        } catch (err) {
          console.warn(`FileWatcher: auto-commit failed for ${worktreeDir}:`, err)
        }
        onWorktreeChange?.(worktreeDir)
      }, debounceMs)
    }
    const state: WatcherState = {
      watcher,
      timer: null,
      debounceMs,
      scheduleCommit: debouncedCommit,
    }
    watchers.set(worktreeDir, state)
    const handleEvent = () => {
      onWorktreeChange?.(worktreeDir)
      debouncedCommit()
    } // Files written before the initial scan completes are treated as initial
    // content by chokidar and never produce events; commit them on ready.
    // Dot paths are filtered like the event stream filters them, so a
    // dotfile-only change never triggers the catch-up commit.
    watcher.on('ready', () => {
      try {
        const hasNonDotChange = commands
          .executeSync('git.status', worktreeDir)
          .split('\n')
          .some((line) => {
            const entry = statusEntryPath(line)
            return entry !== undefined && !hasDotSegment(entry)
          })
        if (hasNonDotChange) {
          debouncedCommit()
        }
      } catch (err) {
        console.warn(`FileWatcher: catch-up check failed for ${worktreeDir}:`, err)
      }
    })
    watcher.on('error', (err) => {
      console.warn(`FileWatcher: watcher error for ${worktreeDir}:`, err)
    })
    watcher.on('add', handleEvent)
    watcher.on('change', handleEvent)
    watcher.on('unlink', handleEvent)
    watcher.on('addDir', handleEvent)
    watcher.on('unlinkDir', handleEvent)
  }

  async function stop(worktreeDir: string): Promise<void> {
    subscribers.delete(worktreeDir)
    const paused = pausedWatches.get(worktreeDir)
    if (paused) paused.debounceMs = undefined
    await closeWatch(worktreeDir)
  }

  async function closeWatch(worktreeDir: string): Promise<void> {
    const state = watchers.get(worktreeDir)
    if (!state) return
    watchers.delete(worktreeDir)
    await tearDown(state)
  }

  async function stopAll(): Promise<void> {
    subscribers.clear()
    for (const paused of pausedWatches.values()) paused.debounceMs = undefined
    const states = [...watchers.values()]
    watchers.clear()
    await Promise.all(states.map((state) => tearDown(state)))
  }

  async function runWithWatchPaused<T>(worktreeDir: string, task: () => T | Promise<T>): Promise<T> {
    const paused = pausedWatches.get(worktreeDir) ?? {
      debounceMs: watchers.get(worktreeDir)?.debounceMs,
      pending: 0,
      tail: Promise.resolve(),
    }
    const previous = paused.tail
    let release!: () => void
    paused.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    paused.pending += 1
    pausedWatches.set(worktreeDir, paused)
    try {
      await previous
      await closeWatch(worktreeDir)
      return await task()
    } finally {
      paused.pending -= 1
      try {
        if (paused.pending === 0) {
          pausedWatches.delete(worktreeDir)
          if (paused.debounceMs !== undefined) {
            watch(worktreeDir, paused.debounceMs)
            watchers.get(worktreeDir)?.scheduleCommit()
          }
        }
      } finally {
        release()
      }
    }
  }

  async function tearDown(state: WatcherState): Promise<void> {
    if (state.timer) adapters.clearTimer(state.timer)
    try {
      await state.watcher.close()
    } catch (err) {
      console.warn('FileWatcher: failed to close watcher:', err)
    }
  }

  return {
    subscribe,
    stop,
    stopAll,
    runWithWatchPaused,
  }
}
