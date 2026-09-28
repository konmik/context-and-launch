import type { JSX } from '@solidjs/web'
import { untrack } from 'solid-js'
import { createSortable } from '~/components/drag/drag-context.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import TaskCard from '../task/TaskCard'
import { DND_ACTIVE_CLASS } from './dnd-shared.js'
import { makeId } from './kanban-id.js'

export function SortableTaskCard(props: {
  task: TaskInfo
  column: string
  activeId: string | null
  orphanedStatus?: string
  onDelete: (task: TaskInfo) => void
  onArchive: (task: TaskInfo) => void
  onViewDetail: (task: TaskInfo) => void
  onOpenFolder: (task: TaskInfo) => void
  onReviewChanges: (task: TaskInfo) => void
}): JSX.Element {
  const id = untrack(() => makeId(props.column, props.task.folderName))
  const sortable = createSortable(id)
  const isActive = () => props.activeId === id
  return (
    <div
      ref={sortable.ref}
      data-sortable-id={id}
      role="button"
      tabindex="0"
      aria-label={`Drag task ${props.task.number} to reorder`}
      class={isActive() ? DND_ACTIVE_CLASS : undefined}
      {...sortable.dragActivators}
    >
      <TaskCard
        task={props.task}
        orphanedStatus={props.orphanedStatus}
        onDelete={props.onDelete}
        onArchive={props.onArchive}
        onViewDetail={props.onViewDetail}
        onOpenFolder={props.onOpenFolder}
        onReviewChanges={props.onReviewChanges}
      />
    </div>
  )
}
