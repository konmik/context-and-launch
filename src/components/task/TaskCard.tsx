import type { JSX } from '@solidjs/web'
import { Show, useContext } from 'solid-js'
import { EllipsisVertical } from '~/components/ui/icons/EllipsisVertical.js'
import { MenuRoot } from '../ui/MenuRoot.js'
import { MenuTrigger } from '../ui/MenuTrigger.js'
import { MenuContent } from '../ui/MenuContent.js'
import { ShortcutRunnerContext } from '../board/shortcut-runner-context.js'
import TaskActionItems from './TaskActionItems'
import type { TaskInfo } from '~/core/task/task-store.js'
import HerdrStatusIcon from './HerdrStatusIcon.js'
import { useHerdrStatuses } from './herdr-statuses-context.js'

interface TaskCardProps {
  task: TaskInfo
  orphanedStatus?: string
  onDelete: (task: TaskInfo) => void
  onArchive: (task: TaskInfo) => void
  onViewDetail: (task: TaskInfo) => void
  onOpenFolder?: (task: TaskInfo) => void
  onReviewChanges?: (task: TaskInfo) => void
}

export default function TaskCard(props: TaskCardProps): JSX.Element {
  const herdrStatus = useHerdrStatuses()
  const shortcutRunner = useContext(ShortcutRunnerContext)

  function handleCardClick(e: MouseEvent) {
    const target = e.target
    if (target instanceof Element && target.closest('[data-menu]')) return
    props.onViewDetail(props.task)
  }

  return (
    <div
      data-drag-source
      data-testid="kanban-board-task-card"
      data-folder-name={props.task.folderName}
      class="task-card cursor-pointer rounded-md bg-card p-3 transition-colors hover:bg-accent"
      onClick={handleCardClick}
    >
      <div class="mb-1 flex items-start justify-between">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="label-mono font-medium text-primary">{props.task.number}</span>
          <Show when={herdrStatus(props.task.folderName)}>{(s) => <HerdrStatusIcon status={s()} />}</Show>
        </div>
        <div data-menu class="-mr-2 -mt-2">
          <MenuRoot
            trigger={
              <MenuTrigger
                class="btn-ghost-icon size-8"
                aria-label="Task actions"
                data-testid="kanban-board-task-menu-trigger"
                onClick={(event: MouseEvent) => event.stopPropagation()}
              >
                <EllipsisVertical size={20} />
              </MenuTrigger>
            }
          >
            <MenuContent onClick={(event) => event.stopPropagation()}>
              <TaskActionItems
                hasAgentWorktree={props.task.hasAgentWorktree}
                shortcuts={shortcutRunner?.shortcuts() ?? []}
                isShortcutRunning={!!shortcutRunner?.running()}
                callbacks={{
                  onOpenFolder: props.onOpenFolder ? () => props.onOpenFolder!(props.task) : undefined,
                  onOpenWorktree: shortcutRunner ? () => shortcutRunner.openWorktree(props.task) : undefined,
                  onArchive: () => props.onArchive(props.task),
                  onDelete: () => props.onDelete(props.task),
                  onReviewChanges: props.onReviewChanges ? () => props.onReviewChanges!(props.task) : undefined,
                  onRunShortcut: (shortcutName) => shortcutRunner?.run(props.task, shortcutName),
                }}
              />
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <p class="line-clamp-2 text-sm">{props.task.title}</p>
      {props.orphanedStatus && (
        <p class="mt-1 text-xs text-destructive" data-testid="kanban-board-task-orphaned-status">
          {props.orphanedStatus}
        </p>
      )}
    </div>
  )
}
