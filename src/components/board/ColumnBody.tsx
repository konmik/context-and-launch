import type { JSX } from '@solidjs/web'
import { createEffect, For, Show } from 'solid-js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import { resolvePreviewInsertBefore } from './drop-index.js'
import { parseId } from './kanban-id.js'
import { type TaskColumnProps } from './task-column.js'
import { COLUMN_CELL_CLASS } from './task-column.js'
import { TaskDropPreview } from './TaskDropPreview.js'
import { SortableTaskCard } from './SortableTaskCard.js'
import { EmptyColumnDropzone } from './EmptyColumnDropzone.js'

export function ColumnBody(
  props: TaskColumnProps & {
    column: ColumnDefinition
    tasks: TaskInfo[]
    registerRef: (column: string, el: HTMLDivElement) => () => void
  },
): JSX.Element {
  let columnRef!: HTMLDivElement
  createEffect(
    () => ({
      column: props.column.name,
      register: props.registerRef,
    }),
    ({ column, register }) => register(column, columnRef),
  )
  const sourceIndexInColumn = () => {
    const aid = props.activeId
    if (!aid) return null
    const { column, folderName } = parseId(aid)
    if (column !== props.column.name) return null
    const idx = props.tasks.findIndex((t) => t.folderName === folderName)
    return idx === -1 ? null : idx
  }
  const previewAt = () => resolvePreviewInsertBefore(props.hoverTarget, props.column.name, sourceIndexInColumn())
  return (
    <div class={COLUMN_CELL_CLASS} data-testid="kanban-board-column-body" data-column-name={props.column.name}>
      <div ref={columnRef} class="flex flex-1 flex-col gap-2 pb-4">
        <For each={props.tasks} keyed={(task) => task.folderName}>
          {(task, i) => (
            <>
              <Show when={previewAt() === i() && props.activeTask}>{(t) => <TaskDropPreview task={t()} />}</Show>
              <SortableTaskCard
                task={task()}
                column={props.column.name}
                activeId={props.activeId}
                onDelete={props.onDelete}
                onArchive={props.onArchive}
                onViewDetail={props.onViewDetail}
                onOpenFolder={props.onOpenFolder}
                onReviewChanges={props.onReviewChanges}
              />
            </>
          )}
        </For>
        <Show when={previewAt() === props.tasks.length && props.activeTask}>{(t) => <TaskDropPreview task={t()} />}</Show>
        <Show when={props.tasks.length === 0}>
          <EmptyColumnDropzone column={props.column.name} />
        </Show>
      </div>
    </div>
  )
}
