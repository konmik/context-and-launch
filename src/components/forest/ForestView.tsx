import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import { createForestLayoutStorage, ForestLayoutContext } from './forest-layout-storage.js'
import type { BoardState } from '~/core/board/board-types.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { ForestViewContent } from './ForestViewContent.js'

export interface ForestViewProps {
  board: BoardState
  projectSlug: string
  onViewDetail: (ticket: TicketInfo) => void
  onClose: () => void
  suggestedNextNumber?: string | null
}

export default function ForestView(props: ForestViewProps): JSX.Element {
  return (
    <Show when={props.projectSlug} keyed>
      {(projectSlug) => (
        <ForestLayoutContext value={createForestLayoutStorage(projectSlug)}>
          <ForestViewContent {...props} />
        </ForestLayoutContext>
      )}
    </Show>
  )
}
