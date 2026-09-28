import type { LauncherShortcut } from '../../core/launcher/launcher-config-data.js'
import type { SourceAccessor } from 'solid-js'
import type { ShortcutConfirmation } from '../task/task-detail-shortcuts.js'
import type { Setter } from 'solid-js'
import { createSignal, createMemo, flush } from 'solid-js'
import { createShortcutState } from '../task/task-detail-shortcuts.js'
import { openTaskWorktree } from '../task/task-api.js'
import { computeLaunchDir } from '../launcher/agent-launcher-pure.js'
import type { MergedLauncherConfigWithMeta } from '../launcher/launcher-api.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'

export function createBoardShortcutRunner(deps: {
  onError: (error: ErrorInfo) => void
  projectSlug: () => string
  config: () => MergedLauncherConfigWithMeta | undefined
}): BoardShortcutRunnerResult {
  const [activeTask, setActiveTask] = createSignal<TaskInfo>()
  const launchDir = createMemo(() => {
    const task = activeTask()
    const config = deps.config()
    if (!task || !config) return ''
    return computeLaunchDir({
      useWorktree: task.useWorktree,
      projectPath: config.projectPath,
      worktreeRootPath: config.worktreeRootPath,
      agentWorktreeDir: config.agentWorktreeDir,
      folderName: task.folderName,
      savedAgentWorktreeDir: task.agentWorktreeDir,
    })
  })
  const shortcutState = createShortcutState({
    projectSlug: deps.projectSlug,
    folderName: () => activeTask()?.folderName ?? '',
    useWorktree: () => activeTask()?.useWorktree ?? false,
    launchDir,
    onError: deps.onError,
  })

  function run(task: TaskInfo, name: string) {
    setActiveTask(task) // The shortcut command imperatively reads the task selected by this same event.
    flush()
    void shortcutState.runShortcut(name)
  }

  async function openWorktree(task: TaskInfo) {
    try {
      const result = await openTaskWorktree(deps.projectSlug(), task.folderName)
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (e) {
      deps.onError(errorPayload(e, 'Open failed'))
    }
  }

  return {
    shortcuts: () => deps.config()?.shortcuts ?? [],
    running: shortcutState.runningShortcut,
    confirmation: shortcutState.shortcutConfirmation,
    setConfirmation: shortcutState.setShortcutConfirmation,
    proceed: (name: string) => void shortcutState.runShortcut(name, true),
    run,
    openWorktree: (task: TaskInfo) => void openWorktree(task),
  }
}

export interface BoardShortcutRunnerResult {
  shortcuts: () => (LauncherShortcut & {
    scope: 'app' | 'project'
    order: number
  })[]
  running: SourceAccessor<string>
  confirmation: SourceAccessor<ShortcutConfirmation | undefined>
  setConfirmation: Setter<ShortcutConfirmation | undefined>
  proceed: (name: string) => undefined
  run: (task: TaskInfo, name: string) => void
  openWorktree: (task: TaskInfo) => undefined
}
