import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { type TaskColumnProps } from './task-column.js'
import { SortableTaskCard } from './SortableTaskCard.js'

export function UndefinedColumnBody(
  props: TaskColumnProps & {
    tasks: TaskInfo[]
  },
): JSX.Element {
  return (
    <div
      class={'flex min-w-[250px] flex-1 flex-col rounded-b-md ' + 'border border-t-0 border-destructive px-3 pb-3'}
      data-testid="kanban-board-column-body"
      data-column-name="undefined"
    >
      <div class="flex flex-1 flex-col gap-2">
        <For each={props.tasks} keyed={(task) => task.folderName}>
          {(task) => (
            <SortableTaskCard
              task={task()}
              column="undefined"
              activeId={props.activeId}
              onDelete={props.onDelete}
              onArchive={props.onArchive}
              onViewDetail={props.onViewDetail}
              onOpenFolder={props.onOpenFolder}
              onReviewChanges={props.onReviewChanges}
              orphanedStatus={task().status}
            />
          )}
        </For>
      </div>
    </div>
  )
}
