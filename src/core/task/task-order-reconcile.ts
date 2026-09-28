import type { TaskInfo } from './task-store.js'
import type { TaskOrder } from './task-order-data.js'

export function reconcileOrder(existing: TaskOrder, tasks: TaskInfo[], columns: string[]): ReconcileOrderResult {
  if (columns.length === 0)
    return {
      order: {},
      changed: JSON.stringify(existing) !== '{}',
    }
  const tasksByColumn = new Map<string, string[]>()
  for (const col of columns) {
    tasksByColumn.set(col, [])
  }
  for (const t of tasks) {
    const col = columns.includes(t.status) ? t.status : columns[0]
    tasksByColumn.get(col)!.push(t.folderName)
  }
  const result: TaskOrder = {}
  for (const col of columns) {
    const actualFolders = new Set(tasksByColumn.get(col) ?? [])
    const existingOrder = existing[col] ?? []
    const ordered: string[] = []
    for (const fn of existingOrder) {
      if (actualFolders.has(fn)) {
        ordered.push(fn)
        actualFolders.delete(fn)
      }
    }
    for (const fn of actualFolders) {
      ordered.push(fn)
    }
    result[col] = ordered
  }
  const changed = JSON.stringify(result) !== JSON.stringify(existing)
  return {
    order: result,
    changed,
  }
}

export interface ReconcileOrderResult {
  order: TaskOrder
  changed: boolean
}
