import type { TaskInfo } from '~/core/task/task-store.js'
import { type HoverTarget } from './drop-index.js'

export interface TaskColumnProps {
  activeId: string | null
  activeTask: TaskInfo | null
  hoverTarget: HoverTarget | null
  onDelete: (task: TaskInfo) => void
  onArchive: (task: TaskInfo) => void
  onViewDetail: (task: TaskInfo) => void
  onOpenFolder: (task: TaskInfo) => void
  onReviewChanges: (task: TaskInfo) => void
}

export const COLUMN_CELL_CLASS = 'flex min-w-[250px] flex-1 flex-col px-4'
