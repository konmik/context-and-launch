import type { JSX } from '@solidjs/web'
import type { TaskInfo } from '~/core/task/task-store.js'
import TaskCard from '../task/TaskCard'
import { DragPreview } from './DragPreview.js'

export function TaskDropPreview(props: { task: TaskInfo }): JSX.Element {
  return (
    <DragPreview>
      <TaskCard task={props.task} onDelete={() => {}} onArchive={() => {}} onViewDetail={() => {}} onReviewChanges={() => {}} />
    </DragPreview>
  )
}
