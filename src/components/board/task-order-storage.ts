import { createContext, createEffect, createMemo } from 'solid-js'
import type { TaskOrder } from '~/core/task/task-order-data.js'
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js'
import { readTaskOrder, saveTaskOrder } from '../task/task-api.js'

export const TaskOrderContext = createContext<StoredSignal<TaskOrder>>()

export function createTaskOrderStorage(
  props: {
    projectSlug: string
    order: TaskOrder
  },
  persistence = {
    read: readTaskOrder,
    save: saveTaskOrder,
  },
): StoredSignal<TaskOrder> {
  const project = createMemo(() => {
    const projectSlug = props.projectSlug
    return createStoredSignal(
      () => props.order,
      async (transform) => {
        const current = await persistence.read(projectSlug)
        if (current.type === 'Failure') return current
        return persistence.save(projectSlug, current.value, transform(current.value))
      },
    )
  })
  createEffect(
    () => ({
      order: props.order,
      storage: project(),
    }),
    ({ storage }) => {
      void storage.refresh()
    },
  )
  return {
    get: () => project().get(),
    update: (transform) => project().update(transform),
    refresh: () => project().refresh(),
  }
}
