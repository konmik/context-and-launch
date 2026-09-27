import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { type TicketColumnProps } from './ticket-column.js'
import { SortableTicketCard } from './SortableTicketCard.js'

export function UndefinedColumnBody(
  props: TicketColumnProps & {
    tickets: TicketInfo[]
  },
): JSX.Element {
  return (
    <div
      class={'flex min-w-[250px] flex-1 flex-col rounded-b-md ' + 'border border-t-0 border-destructive px-3 pb-3'}
      data-testid="kanban-board-column-body"
      data-column-name="undefined"
    >
      <div class="flex flex-1 flex-col gap-2">
        <For each={props.tickets} keyed={(ticket) => ticket.folderName}>
          {(ticket) => (
            <SortableTicketCard
              ticket={ticket()}
              column="undefined"
              activeId={props.activeId}
              onDelete={props.onDelete}
              onArchive={props.onArchive}
              onViewDetail={props.onViewDetail}
              onOpenFolder={props.onOpenFolder}
              onReviewChanges={props.onReviewChanges}
              orphanedStatus={ticket().status}
            />
          )}
        </For>
      </div>
    </div>
  )
}
