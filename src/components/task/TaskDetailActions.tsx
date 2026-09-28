import type { JSX } from '@solidjs/web'
import { untrack } from 'solid-js'
import { Zap } from '~/components/ui/icons/Zap.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { MenuRoot } from '../ui/MenuRoot.js'
import { MenuTrigger } from '../ui/MenuTrigger.js'
import { MenuContent } from '../ui/MenuContent.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { openTaskFolder, openTaskWorktree } from './task-api.js'
import { createShortcutState } from './task-detail-shortcuts.js'
import { ShortcutConfirmationDialog } from './ShortcutConfirmationDialog.js'
import TaskActionItems from './TaskActionItems'

interface TaskDetailActionsProps {
  projectSlug: string
  task: TaskInfo
  shortcuts: {
    name: string
  }[]
  launchDir: string
  hasUnsavedChanges: boolean
  onArchive?: (task: TaskInfo) => void
  onDelete?: (task: TaskInfo) => void
  onReviewChanges?: (task: TaskInfo) => void
}

export default function TaskDetailActions(props: TaskDetailActionsProps): JSX.Element {
  const errors = useErrorReporter()
  const shortcutState = untrack(() =>
    createShortcutState({
      projectSlug: () => props.projectSlug,
      folderName: () => props.task.folderName,
      useWorktree: () => props.task.useWorktree,
      launchDir: () => props.launchDir,
      onError: errors.report,
      onClearError: errors.clear,
    }),
  )
  return (
    <>
      <MenuRoot
        trigger={
          <MenuTrigger class="btn-ghost-icon h-8 w-8" aria-label="Task actions" data-testid="task-detail-actions-menu-trigger">
            <Zap size={16} />
          </MenuTrigger>
        }
      >
        <MenuContent>
          <TaskActionItems
            hasAgentWorktree={props.task.hasAgentWorktree}
            shortcuts={props.shortcuts}
            isShortcutRunning={shortcutState.runningShortcut() !== ''}
            hasUnsavedChanges={props.hasUnsavedChanges}
            callbacks={{
              onOpenFolder: () => {
                void errors.runAndReportErrors(() => openTaskFolder(props.projectSlug, props.task.folderName))
              },
              onOpenWorktree: () => {
                void errors.runAndReportErrors(() => openTaskWorktree(props.projectSlug, props.task.folderName))
              },
              onArchive: props.onArchive ? () => props.onArchive!(props.task) : undefined,
              onDelete: props.onDelete ? () => props.onDelete!(props.task) : undefined,
              onReviewChanges: props.onReviewChanges ? () => props.onReviewChanges!(props.task) : undefined,
              onRunShortcut: shortcutState.runShortcut,
            }}
          />
        </MenuContent>
      </MenuRoot>
      <ShortcutConfirmationDialog
        info={shortcutState.shortcutConfirmation()}
        running={shortcutState.runningShortcut() !== ''}
        onCancel={() => shortcutState.setShortcutConfirmation(undefined)}
        onProceed={(shortcutName) => {
          shortcutState.setShortcutConfirmation(undefined)
          void shortcutState.runShortcut(shortcutName, true)
        }}
      />
    </>
  )
}
