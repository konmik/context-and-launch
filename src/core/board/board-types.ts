import type { ProjectInfo } from '~/core/project/project-registry.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { TaskOrder } from '~/core/task/task-order-data.js'

export interface BoardState {
  columns: ColumnDefinition[]
  tasks: TaskInfo[]
  taskOrder: TaskOrder
}

interface BoardPageBase {
  projects: ProjectInfo[]
  projectSlug: string
}

export interface SyncStatus {
  hasRemote: boolean
  hasConflict: boolean
}

export interface LoadedProjectPageData {
  status: 'loaded'
  board: Omit<BoardState, 'columns'>
  suggestedNextNumber: string | null
}

export interface NotFoundProjectPageData {
  status: 'not-found'
}

export interface UnavailableProjectPageData {
  status: 'unavailable'
  projectPath: string
}

export interface ErrorProjectPageData {
  status: 'error'
  projectPath: string
  error: UserFacingError
}

export type ProjectPageData =
  | (BoardPageBase & LoadedProjectPageData)
  | (BoardPageBase & NotFoundProjectPageData)
  | (BoardPageBase & UnavailableProjectPageData)
  | (BoardPageBase & ErrorProjectPageData)
