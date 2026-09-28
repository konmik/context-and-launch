import type { JSX } from '@solidjs/web'
import { Show, untrack } from 'solid-js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { launchAgentAction } from '../launcher/launcher-api.js'
import { type TaskDetailStateDeps } from './task-detail-state.js'
import { ErrorScope } from '../shared/ErrorScope.js'
import { createTaskStatusStorage, TaskStatusContext } from './task-status-storage.js'
import { TaskDetailContent } from './TaskDetailContent.js'

interface TaskDetailDialogProps {
  onClose: () => void
  onArchive?: (task: TaskInfo) => void
  onDelete?: (task: TaskInfo) => void
  onReviewChanges?: (task: TaskInfo) => void
  projectSlug: string
  task: TaskInfo | null
  stateDeps?: Partial<TaskDetailStateDeps>
  launchAgent?: typeof launchAgentAction
}

export default function TaskDetailDialog(props: TaskDetailDialogProps): JSX.Element {
  return (
    <Show when={props.task?.folderName} keyed>
      {(_folderName) => (
        <TaskStatusContext
          value={untrack(() => props.stateDeps?.taskStatus ?? createTaskStatusStorage(props.projectSlug, props.task!))}
        >
          <ErrorScope active={true}>
            <TaskDetailContent
              onClose={props.onClose}
              onArchive={props.onArchive}
              onDelete={props.onDelete}
              projectSlug={props.projectSlug}
              onReviewChanges={props.onReviewChanges}
              stateDeps={props.stateDeps}
              launchAgent={props.launchAgent}
            />
          </ErrorScope>
        </TaskStatusContext>
      )}
    </Show>
  )
}
