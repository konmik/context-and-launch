import type { ProjectInfo } from '~/core/project/project-registry.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import type { TicketOrder } from '~/core/ticket/ticket-order-data.js'

export interface BoardState {
  columns: ColumnDefinition[]
  tickets: TicketInfo[]
  ticketOrder: TicketOrder
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
  projectPath: string
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
  error: string
}

export type ProjectPageData =
  | (BoardPageBase & LoadedProjectPageData)
  | (BoardPageBase & NotFoundProjectPageData)
  | (BoardPageBase & UnavailableProjectPageData)
  | (BoardPageBase & ErrorProjectPageData)
