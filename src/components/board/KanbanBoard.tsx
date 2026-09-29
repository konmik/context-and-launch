import type { JSX } from '@solidjs/web'
import { createMemo, For, Show, useContext } from 'solid-js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { revalidate } from '@solidjs/router'
import { TaskOrderContext } from './task-order-storage.js'
import { taskMutationRevalidateKeys } from '../shared/revalidate-keys.js'
import { DragDropProvider } from '~/components/drag/DragDropProvider.js'
import { DragOverlay } from '~/components/drag/DragOverlay.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { BoardState } from '~/components/project/project-api.js'
import TaskCard from '../task/TaskCard'
import { DragOverlayCard } from './DragOverlayCard.js'
import { ColumnHeader } from './ColumnHeader.js'
import { ColumnBody } from './ColumnBody.js'
import { UndefinedColumnHeader } from './UndefinedColumnHeader.js'
import { UndefinedColumnBody } from './UndefinedColumnBody.js'
import { resolveTasksForColumn, type DropResult } from './board-logic.js'
import { moveTaskInOrder } from '~/core/task/task-order-data.js'
import { createBoardDnd } from './board-state.js'
import type { Accessor } from 'solid-js'
import type { DragState } from './board-state.js'
import { openTaskFolder, updateTask } from '../task/task-api.js'
import { success } from '~/util/result.js'

interface KanbanBoardProps {
  board: BoardState
  projectSlug: string
  onDelete: (task: TaskInfo) => void
  onArchive: (task: TaskInfo) => void
  onViewDetail: (task: TaskInfo) => void
  onReviewChanges?: (task: TaskInfo) => void
  dragState?: Accessor<DragState>
  activeTask?: Accessor<TaskInfo | null>
}

export default function KanbanBoard(props: KanbanBoardProps): JSX.Element {
  const order = useContext(TaskOrderContext)!
  const errors = useErrorReporter()
  const projectSlug = createMemo(() => props.projectSlug)
  const dnd = createMemo(() => {
    projectSlug()
    return createBoardDnd(() => ({
      ...props.board,
      taskOrder: order.get(),
    }))
  })
  const board = () => dnd().board()
  const drag = props.dragState ?? (() => dnd().drag())
  const activeTask = props.activeTask ?? (() => dnd().activeTask())
  let dropSaveQueue = Promise.resolve()

  function enqueueDropSave(drop: DropResult) {
    const savingProjectSlug = props.projectSlug
    const session = dnd()
    dropSaveQueue = dropSaveQueue.then(() =>
      errors.runAndReportErrors(async () => {
        try {
          if (dnd() !== session) return success(undefined)
          if (props.board.tasks.find((task) => task.folderName === drop.folderName)?.status !== drop.toColumn) {
            const status = await updateTask(savingProjectSlug, drop.folderName, null, null, drop.toColumn)
            if (status.type === 'Failure') return status
            if (dnd() !== session) return success(undefined)
          }
          const result = await order.update((current) =>
            moveTaskInOrder(current, drop.folderName, drop.fromColumn, drop.toColumn, drop.newIndex),
          )
          await revalidate(taskMutationRevalidateKeys)
          return result
        } finally {
          session.commands.removePendingDrop(drop)
        }
      }),
    )
  }

  const openFolder = (task: TaskInfo) => {
    void errors.runAndReportErrors(() => openTaskFolder(props.projectSlug, task.folderName))
  }
  const tasksFor = (column: string) => resolveTasksForColumn(column, board().taskOrder, board().taskMap, board().orphanFolderNames)
  let headerRow!: HTMLDivElement
  let scrollBody!: HTMLDivElement
  const syncHeaderScroll = () => {
    headerRow.scrollLeft = scrollBody.scrollLeft
  }
  return (
    <DragDropProvider
      onDragStart={(e) => dnd().commands.startDrag(String(e.draggable.id))}
      onDragMove={(e) => dnd().commands.handleDragMove(e)}
      onDragEnd={() => {
        const drop = dnd().commands.endDrag()
        if (drop) enqueueDropSave(drop)
      }}
    >
      <div class="flex min-h-0 flex-1 flex-col">
        <div
          ref={headerRow}
          class="shrink-0 overflow-hidden px-4"
          style={{
            'scrollbar-gutter': 'stable',
          }}
        >
          <div class="flex divide-x divide-border">
            <For each={props.board.columns}>
              {(column, i) => (
                <ColumnHeader
                  column={column}
                  count={tasksFor(column.name).length}
                  edgeLeft={i() === 0}
                  edgeRight={i() === props.board.columns.length - 1 && board().orphanedTasks.length === 0}
                />
              )}
            </For>
            <Show when={board().orphanedTasks.length > 0}>
              <UndefinedColumnHeader />
            </Show>
          </div>
        </div>
        <div
          ref={scrollBody}
          class="min-h-0 flex-1 overflow-auto px-4"
          style={{
            'scrollbar-gutter': 'stable',
          }}
          data-testid="kanban-board-scroll"
          onScroll={syncHeaderScroll}
        >
          <div class="flex min-h-full divide-x divide-border">
            <For each={props.board.columns}>
              {(column) => (
                <ColumnBody
                  column={column}
                  tasks={tasksFor(column.name)}
                  registerRef={dnd().commands.registerColumnRef}
                  activeId={drag().activeId}
                  activeTask={activeTask()}
                  hoverTarget={drag().hoverTarget}
                  onDelete={props.onDelete}
                  onArchive={props.onArchive}
                  onViewDetail={props.onViewDetail}
                  onOpenFolder={openFolder}
                  onReviewChanges={props.onReviewChanges ?? (() => {})}
                />
              )}
            </For>
            <Show when={board().orphanedTasks.length > 0}>
              <UndefinedColumnBody
                tasks={board().orphanedTasks}
                activeId={drag().activeId}
                activeTask={activeTask()}
                hoverTarget={drag().hoverTarget}
                onDelete={props.onDelete}
                onArchive={props.onArchive}
                onViewDetail={props.onViewDetail}
                onOpenFolder={openFolder}
                onReviewChanges={props.onReviewChanges ?? (() => {})}
              />
            </Show>
          </div>
        </div>
      </div>
      <DragOverlay>
        {() => (
          <Show when={activeTask()}>
            {(t) => (
              <DragOverlayCard
                style={{
                  width: '250px',
                }}
              >
                <TaskCard task={t()} onDelete={() => {}} onArchive={() => {}} onViewDetail={() => {}} onReviewChanges={() => {}} />
              </DragOverlayCard>
            )}
          </Show>
        )}
      </DragOverlay>
    </DragDropProvider>
  )
}
