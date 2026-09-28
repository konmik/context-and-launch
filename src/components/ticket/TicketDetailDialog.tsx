import type { JSX } from '@solidjs/web'
import { Show, untrack } from 'solid-js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { launchAgentAction } from '../launcher/launcher-api.js'
import { type TicketDetailStateDeps } from './ticket-detail-state.js'
import { ErrorScope } from '../shared/ErrorScope.js'
import { createTicketStatusStorage, TicketStatusContext } from './ticket-status-storage.js'
import { TicketDetailContent } from './TicketDetailContent.js'

interface TicketDetailDialogProps {
  onClose: () => void
  onArchive?: (ticket: TicketInfo) => void
  onDelete?: (ticket: TicketInfo) => void
  onReviewChanges?: (ticket: TicketInfo) => void
  projectSlug: string
  ticket: TicketInfo | null
  stateDeps?: Partial<TicketDetailStateDeps>
  launchAgent?: typeof launchAgentAction
}

export default function TicketDetailDialog(props: TicketDetailDialogProps): JSX.Element {
  return (
    <Show when={props.ticket?.folderName} keyed>
      {(_folderName) => (
        <TicketStatusContext
          value={untrack(() => props.stateDeps?.ticketStatus ?? createTicketStatusStorage(props.projectSlug, props.ticket!))}
        >
          <ErrorScope active={true}>
            <TicketDetailContent
              onClose={props.onClose}
              onArchive={props.onArchive}
              onDelete={props.onDelete}
              projectSlug={props.projectSlug}
              onReviewChanges={props.onReviewChanges}
              stateDeps={props.stateDeps}
              launchAgent={props.launchAgent}
            />
          </ErrorScope>
        </TicketStatusContext>
      )}
    </Show>
  )
}
