import type { JSX } from '@solidjs/web'
import { For, Show } from 'solid-js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import { resolvePreviewInsertBefore } from './drop-index.js'
import { parseId } from './kanban-id.js'
import { type TicketColumnProps } from './ticket-column.js'
import { COLUMN_CELL_CLASS } from './ticket-column.js'
import { TicketDropPreview } from './TicketDropPreview.js'
import { SortableTicketCard } from './SortableTicketCard.js'
import { EmptyColumnDropzone } from './EmptyColumnDropzone.js'

export function ColumnBody(
  props: TicketColumnProps & {
    column: ColumnDefinition
    tickets: TicketInfo[]
    registerRef: (el: HTMLDivElement) => void
  },
): JSX.Element {
  const sourceIndexInColumn = () => {
    const aid = props.activeId
    if (!aid) return null
    const { column, folderName } = parseId(aid)
    if (column !== props.column.name) return null
    const idx = props.tickets.findIndex((t) => t.folderName === folderName)
    return idx === -1 ? null : idx
  }
  const previewAt = () => resolvePreviewInsertBefore(props.hoverTarget, props.column.name, sourceIndexInColumn())
  return (
    <div class={COLUMN_CELL_CLASS} data-testid="kanban-board-column-body" data-column-name={props.column.name}>
      <div ref={(el) => props.registerRef(el)} class="flex flex-1 flex-col gap-2 pb-4">
        <For each={props.tickets} keyed={(ticket) => ticket.folderName}>
          {(ticket, i) => (
            <>
              <Show when={previewAt() === i() && props.activeTicket}>{(t) => <TicketDropPreview ticket={t()} />}</Show>
              <SortableTicketCard
                ticket={ticket()}
                column={props.column.name}
                activeId={props.activeId}
                onDelete={props.onDelete}
                onArchive={props.onArchive}
                onViewDetail={props.onViewDetail}
                onOpenFolder={props.onOpenFolder}
                onReviewChanges={props.onReviewChanges}
              />
            </>
          )}
        </For>
        <Show when={previewAt() === props.tickets.length && props.activeTicket}>{(t) => <TicketDropPreview ticket={t()} />}</Show>
        <Show when={props.tickets.length === 0}>
          <EmptyColumnDropzone column={props.column.name} />
        </Show>
      </div>
    </div>
  )
}
