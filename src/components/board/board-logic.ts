import type { ForestPosition } from '../forest/forest-types.js'
import type { DragEvent as DndDragEvent } from '~/components/drag/drag-types.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { BoardState } from '~/components/project/project-api.js'
import type { HoverTarget } from './drop-index.js'
import { computeHoverTarget } from './drop-index.js'
import { parseId } from './kanban-id.js'

export interface DropResult {
  folderName: string
  fromColumn: string
  toColumn: string
  newIndex: number
}

export function buildTaskMap(tasks: TaskInfo[]): Map<string, TaskInfo> {
  const map = new Map<string, TaskInfo>()
  for (const t of tasks) map.set(t.folderName, t)
  return map
}

export function computeOrphans(board: BoardState): TaskInfo[] {
  const colNames = new Set(board.columns.map((c) => c.name))
  return board.tasks.filter((t) => !colNames.has(t.status))
}

export function resolveActiveTask(activeId: string | null, taskMap: Map<string, TaskInfo>): TaskInfo | null {
  if (!activeId) return null
  const { folderName } = parseId(activeId)
  return taskMap.get(folderName) ?? null
}

export function resolveTasksForColumn(
  column: string,
  order: Record<string, string[]>,
  taskMap: Map<string, TaskInfo>,
  orphanFolderNames: Set<string>,
): TaskInfo[] {
  const names = order[column] ?? []
  const result: TaskInfo[] = []
  for (const fn of names) {
    if (orphanFolderNames.has(fn)) continue
    const t = taskMap.get(fn)
    if (t) result.push(t)
  }
  return result
}

export function resolveDrop(
  activeId: string | null,
  hoverTarget: HoverTarget | null,
  currentOrder: Record<string, string[]>,
  taskMap: Map<string, TaskInfo>,
  orphanFolderNames: Set<string>,
): DropResult | null {
  if (!activeId || !hoverTarget) return null
  const { column: fromColumn, folderName } = parseId(activeId)
  const { column: toColumn, index: newIndex } = hoverTarget
  if (toColumn === 'undefined') return null
  if (fromColumn === toColumn) {
    const colTasks = resolveTasksForColumn(toColumn, currentOrder, taskMap, orphanFolderNames)
    const fromIdx = colTasks.findIndex((t) => t.folderName === folderName)
    if (fromIdx === newIndex) return null
  }
  return {
    folderName,
    fromColumn,
    toColumn,
    newIndex,
  }
}

export function resolveCursorPosition(event: DndDragEvent): ForestPosition | null {
  const overlay = event.overlay
  const node = event.draggable.node
  if (!node) return null
  if (overlay?.node) {
    const r = overlay.node.getBoundingClientRect()
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    }
  }
  const rect = node.getBoundingClientRect()
  const t = event.draggable.transform
  return {
    x: rect.left + rect.width / 2 + (t?.x ?? 0),
    y: rect.top + rect.height / 2 + (t?.y ?? 0),
  }
}

export function collectColumnRects(columnRefs: Map<string, HTMLDivElement>): CollectColumnRectsResult {
  const colRects = new Map<
    string,
    {
      left: number
      right: number
    }
  >()
  const cardRectsByCol = new Map<
    string,
    {
      top: number
      height: number
    }[]
  >()
  for (const [col, el] of columnRefs) {
    const r = el.getBoundingClientRect()
    colRects.set(col, {
      left: r.left,
      right: r.right,
    })
    const cards = el.querySelectorAll<HTMLElement>('[data-drag-source]:not([data-drop-preview] *)')
    const rects: {
      top: number
      height: number
    }[] = []
    for (const card of cards) {
      const cr = card.getBoundingClientRect()
      rects.push({
        top: cr.top,
        height: cr.height,
      })
    }
    cardRectsByCol.set(col, rects)
  }
  return {
    colRects,
    cardRectsByCol,
  }
}

export function resolveDragSource(
  dragId: string | null,
  order: Record<string, string[]>,
  taskMap: Map<string, TaskInfo>,
  orphanFolderNames: Set<string>,
): HoverTarget | undefined {
  if (!dragId) return undefined
  const { column, folderName } = parseId(dragId)
  const tasks = resolveTasksForColumn(column, order, taskMap, orphanFolderNames)
  const idx = tasks.findIndex((t) => t.folderName === folderName)
  return idx !== -1
    ? {
        column,
        index: idx,
      }
    : undefined
}

export function computeDragMoveTarget(
  event: DndDragEvent,
  dragId: string | null,
  columnRefs: Map<string, HTMLDivElement>,
  order: Record<string, string[]>,
  taskMap: Map<string, TaskInfo>,
  orphanFolderNames: Set<string>,
): HoverTarget | null {
  const cursor = resolveCursorPosition(event)
  if (!cursor) return null
  const { colRects, cardRectsByCol } = collectColumnRects(columnRefs)
  const dragSource = resolveDragSource(dragId, order, taskMap, orphanFolderNames)
  return computeHoverTarget(colRects, cardRectsByCol, cursor, dragSource)
}

export interface CollectColumnRectsResult {
  colRects: Map<
    string,
    {
      left: number
      right: number
    }
  >
  cardRectsByCol: Map<
    string,
    {
      top: number
      height: number
    }[]
  >
}
