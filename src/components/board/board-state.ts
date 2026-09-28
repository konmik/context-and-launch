import type { SourceAccessor } from 'solid-js'
import type { TaskOrder } from '../../core/task/task-order-data.js'
import type { DropResult as DropResultReturn } from './board-logic.js'
import { createSignal, createMemo } from 'solid-js'
import type { DragEvent as DndDragEvent } from '~/components/drag/drag-types.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { BoardState } from '~/components/project/project-api.js'
import type { HoverTarget } from './drop-index.js'
import { buildTaskMap, computeOrphans, resolveActiveTask, resolveDrop, computeDragMoveTarget } from './board-logic.js'

export type { DropResult } from './board-logic.js'

export interface BoardView {
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
  const columnRefs = new Map<string, HTMLDivElement>()
  const board = createMemo((): BoardView => {
    const b = getBoard()
    const taskMap = buildTaskMap(b.tasks)
    const orphanedTasks = computeOrphans(b)
    const orphanFolderNames = new Set(orphanedTasks.map((t) => t.folderName))
    return {
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
  const currentOrder = () => getBoard().taskOrder
  const activeTask = createMemo(() => resolveActiveTask(activeId(), board().taskMap))
  const cancelDrag = () => {
    setActiveId(null)
    setHoverTarget(null)
  }
  const commands = {
    startDrag: (id: string) => setActiveId(id),
    updateHover: (target: HoverTarget | null) => setHoverTarget(target),
    cancelDrag,
    registerColumnRef: (col: string, el: HTMLDivElement) => columnRefs.set(col, el),
    handleDragMove: (e: DndDragEvent) => {
      const { taskMap, orphanFolderNames } = board()
      setHoverTarget(computeDragMoveTarget(e, activeId(), columnRefs, currentOrder(), taskMap, orphanFolderNames))
    },
    endDrag: () => {
      const { taskMap, orphanFolderNames } = board()
      const result = resolveDrop(activeId(), hoverTarget(), currentOrder(), taskMap, orphanFolderNames)
      cancelDrag()
      return result
    },
  }
  return {
    board,
    drag,
    currentOrder,
    activeTask,
    commands,
  }
}

export interface BoardDndResult {
  board: SourceAccessor<BoardView>
  drag: SourceAccessor<DragState>
  currentOrder: () => TaskOrder
  activeTask: SourceAccessor<TaskInfo | null>
  commands: {
    startDrag: (id: string) => string
    updateHover: (target: HoverTarget | null) => HoverTarget | null
    cancelDrag: () => void
    registerColumnRef: (col: string, el: HTMLDivElement) => Map<string, HTMLDivElement>
    handleDragMove: (e: DndDragEvent) => void
    endDrag: () => DropResultReturn | null
  }
}
