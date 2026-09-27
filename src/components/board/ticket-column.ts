import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { type HoverTarget } from './drop-index.js'

export interface TicketColumnProps {
  activeId: string | null
  activeTicket: TicketInfo | null
  hoverTarget: HoverTarget | null
  onDelete: (ticket: TicketInfo) => void
  onArchive: (ticket: TicketInfo) => void
  onViewDetail: (ticket: TicketInfo) => void
  onOpenFolder: (ticket: TicketInfo) => void
  onReviewChanges: (ticket: TicketInfo) => void
}

export const COLUMN_CELL_CLASS = 'flex min-w-[250px] flex-1 flex-col px-4'
