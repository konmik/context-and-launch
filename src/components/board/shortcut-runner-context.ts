import { createContext } from 'solid-js'
import type { MergedLauncherConfig } from '~/core/launcher/launcher-config.js'
import type { TaskInfo } from '~/core/task/task-store.js'

export type BoardShortcut = MergedLauncherConfig['shortcuts'][number]

export interface ShortcutRunner {
  shortcuts: () => BoardShortcut[]
  running: () => string
  run: (task: TaskInfo, name: string) => void
  openWorktree: (task: TaskInfo) => void
}

export const ShortcutRunnerContext = createContext<ShortcutRunner | null>(null)
