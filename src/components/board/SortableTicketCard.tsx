import type { JSX } from '@solidjs/web'
import { untrack } from 'solid-js'
import { createSortable } from '~/components/drag/drag-context.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import TicketCard from '../ticket/TicketCard'
import { DND_ACTIVE_CLASS } from './dnd-shared.js'
import { makeId } from './kanban-id.js'

export function SortableTicketCard(props: {
  ticket: TicketInfo
  column: string
  activeId: string | null
  orphanedStatus?: string
  onDelete: (ticket: TicketInfo) => void
  onArchive: (ticket: TicketInfo) => void
  onViewDetail: (ticket: TicketInfo) => void
  onOpenFolder: (ticket: TicketInfo) => void
  onReviewChanges: (ticket: TicketInfo) => void
}): JSX.Element {
  const id = untrack(() => makeId(props.column, props.ticket.folderName))
  const sortable = createSortable(id)
  const isActive = () => props.activeId === id
  return (
    <div
      ref={sortable.ref}
      data-sortable-id={id}
      role="button"
      tabindex="0"
      aria-label={`Drag ticket ${props.ticket.number} to reorder`}
      class={isActive() ? DND_ACTIVE_CLASS : undefined}
      {...sortable.dragActivators}
    >
      <TicketCard
        ticket={props.ticket}
        orphanedStatus={props.orphanedStatus}
        onDelete={props.onDelete}
        onArchive={props.onArchive}
        onViewDetail={props.onViewDetail}
        onOpenFolder={props.onOpenFolder}
        onReviewChanges={props.onReviewChanges}
      />
    </div>
  )
}
