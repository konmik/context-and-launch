import type { SourceAccessor } from 'solid-js'
import type { TaskOrder } from '../../core/task/task-order-data.js'
import type { DropResult } from './board-logic.js'
import { createSignal, createMemo } from 'solid-js'
import type { DragEvent as DndDragEvent } from '~/components/drag/drag-types.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { BoardState } from '~/components/project/project-api.js'
import type { HoverTarget } from './drop-index.js'
import { buildTaskMap, computeOrphans, resolveActiveTask, resolveDrop, computeDragMoveTarget } from './board-logic.js'
import { moveTaskInOrder } from '~/core/task/task-order-data.js'

export interface BoardView {
  taskOrder: TaskOrder
  taskMap: Map<string, TaskInfo>
  orphanedTasks: TaskInfo[]
  orphanFolderNames: Set<string>
}

export interface DragState {
  activeId: string | null
  hoverTarget: HoverTarget | null
}

export function createBoardDnd(getBoard: () => BoardState): BoardDndResult {
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const [hoverTarget, setHoverTarget] = createSignal<HoverTarget | null>(null)
  const [pendingDrops, setPendingDrops] = createSignal<DropResult[]>([])
  const columnRefs = new Map<string, HTMLDivElement>()
  const board = createMemo((): BoardView => {
    const projectedBoard = pendingDrops().reduce((current, drop) => ({
      ...current,
      tasks: current.tasks.map((task) => task.folderName === drop.folderName ? { ...task, status: drop.toColumn } : task),
      taskOrder: moveTaskInOrder(current.taskOrder, drop.folderName, drop.fromColumn, drop.toColumn, drop.newIndex),
    }), getBoard())
    const taskMap = buildTaskMap(projectedBoard.tasks)
    const orphanedTasks = computeOrphans(projectedBoard)
    const orphanFolderNames = new Set(orphanedTasks.map((t) => t.folderName))
    return {
      taskOrder: projectedBoard.taskOrder,
      taskMap,
      orphanedTasks,
      orphanFolderNames,
    }
  })
  const drag = createMemo(
    (): DragState => ({
      activeId: activeId(),
      hoverTarget: hoverTarget(),
    }),
  )
  const activeTask = createMemo(() => resolveActiveTask(activeId(), board().taskMap))
  const cancelDrag = () => {
    setActiveId(null)
    setHoverTarget(null)
  }
  const commands = {
    startDrag: (id: string) => setActiveId(id),
    removePendingDrop: (drop: DropResult) => {
      setPendingDrops((current) => current.filter((pending) => pending !== drop))
    },
    registerColumnRef: (column: string, el: HTMLDivElement) => {
      columnRefs.set(column, el)
      return () => {
        if (columnRefs.get(column) === el) columnRefs.delete(column)
      }
    },
    handleDragMove: (e: DndDragEvent) => {
      const { taskOrder, taskMap, orphanFolderNames } = board()
      setHoverTarget(computeDragMoveTarget(e, activeId(), columnRefs, taskOrder, taskMap, orphanFolderNames))
    },
    endDrag: () => {
      const { taskOrder, taskMap, orphanFolderNames } = board()
      const result = resolveDrop(activeId(), hoverTarget(), taskOrder, taskMap, orphanFolderNames)
      if (result) setPendingDrops((current) => [...current, result])
      cancelDrag()
      return result
    },
  }
  return {
    board,
    drag,
    activeTask,
    commands,
  }
}

export interface BoardDndResult {
  board: SourceAccessor<BoardView>
  drag: SourceAccessor<DragState>
  activeTask: SourceAccessor<TaskInfo | null>
  commands: {
    startDrag: (id: string) => string
    removePendingDrop: (drop: DropResult) => void
    registerColumnRef: (column: string, el: HTMLDivElement) => () => void
    handleDragMove: (e: DndDragEvent) => void
    endDrag: () => DropResult | null
  }
}
