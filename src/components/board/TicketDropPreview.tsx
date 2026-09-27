import type { JSX } from '@solidjs/web'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import TicketCard from '../ticket/TicketCard'
import { DragPreview } from './DragPreview.js'

export function TicketDropPreview(props: { ticket: TicketInfo }): JSX.Element {
  return (
    <DragPreview>
      <TicketCard ticket={props.ticket} onDelete={() => {}} onArchive={() => {}} onViewDetail={() => {}} onReviewChanges={() => {}} />
    </DragPreview>
  )
}
