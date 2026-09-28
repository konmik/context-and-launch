import { createContext } from 'solid-js'
import { useAction } from '@solidjs/router'
import type { TaskInfo } from '~/core/task/task-store.js'
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js'
import { getTask, saveTaskStatus } from './task-api.js'

export const TaskStatusContext = createContext<StoredSignal<TaskInfo>>()

export function createTaskStatusStorage(projectSlug: string, initialTask: TaskInfo): StoredSignal<TaskInfo> {
  let folderName = initialTask.folderName
  const save = useAction(saveTaskStatus)
  const storage: StoredSignal<TaskInfo> = createStoredSignal(
    () => getTask(projectSlug, folderName),
    async (transform) => {
      const current = storage.get()
      const result = await save(projectSlug, JSON.stringify(current), JSON.stringify(transform(current)))
      if (result.type === 'Success') folderName = result.value.folderName
      return result
    },
    {
      initialValue: initialTask,
    },
  )
  return storage
}
