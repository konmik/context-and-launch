import * as v from 'valibot'
import { isDeepStrictEqual } from 'node:util'
import { reconcileOrder } from './task-order-reconcile.js'
import { createTaskRepository, type TaskRepository } from './task-repository.js'
import type { TaskInfo } from './task-store.js'
import type { TaskOrder } from './task-order-data.js'

const TaskOrderSchema = v.record(v.string(), v.array(v.string()))

export interface TaskOrderStore {
  read(): TaskOrder
  write(order: TaskOrder, expected?: TaskOrder): void
  reconcileAndSave(tasks: TaskInfo[], columns: string[]): TaskOrder
  appendTask(folderName: string, column: string): void
  removeTask(folderName: string): void
  renameTask(oldFolderName: string, newFolderName: string): void
}

export function createTaskOrderStore(worktreeDir: string, repo: TaskRepository = createTaskRepository()): TaskOrderStore {
  function read(): TaskOrder {
    const parsed = repo.readWorktreeJson(worktreeDir, 'task-order.json')
    const result = v.safeParse(TaskOrderSchema, parsed)
    return result.success ? result.output : {}
  }

  function write(order: TaskOrder, expected?: TaskOrder): void {
    const current = read()
    if (isDeepStrictEqual(current, order)) return
    if (expected && !isDeepStrictEqual(current, expected)) {
      throw new Error('Task order changed in another request. Try again.')
    }
    repo.writeWorktreeJson(worktreeDir, 'task-order.json', v.parse(TaskOrderSchema, order))
  }

  function reconcileAndSave(tasks: TaskInfo[], columns: string[]): TaskOrder {
    const existing = read()
    const { order, changed } = reconcileOrder(existing, tasks, columns)
    if (changed) write(order)
    return order
  }

  function appendTask(folderName: string, column: string): void {
    const order = read()
    const folders = order[column] ?? []
    write({
      ...order,
      [column]: folders.includes(folderName) ? folders : [...folders, folderName],
    })
  }

  function removeTask(folderName: string): void {
    const order = read()
    if (!Object.values(order).some((folders) => folders.includes(folderName))) return
    write(Object.fromEntries(Object.entries(order).map(([column, folders]) => [column, folders.filter((folder) => folder !== folderName)])))
  }

  function renameTask(oldFolderName: string, newFolderName: string): void {
    const order = read()
    if (!Object.values(order).some((folders) => folders.includes(oldFolderName))) return
    write(
      Object.fromEntries(
        Object.entries(order).map(([column, folders]) => {
          const renamedIndex = folders.indexOf(oldFolderName)
          return [column, folders.map((folder, index) => (index === renamedIndex ? newFolderName : folder))]
        }),
      ),
    )
  }

  return {
    read,
    write,
    reconcileAndSave,
    appendTask,
    removeTask,
    renameTask,
  }
}
