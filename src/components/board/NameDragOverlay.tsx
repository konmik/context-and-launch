import { Show } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { DragOverlay } from '~/components/drag/DragOverlay.js'
import { DragOverlayCard } from './DragOverlayCard.js'

export function NameDragOverlay(props: { nameOf: (id: string) => string | undefined }): JSX.Element {
  return (
    <DragOverlay>
      {(draggable) => {
        const name = props.nameOf(String(draggable?.id))
        return (
          <Show when={name}>
            {(n) => (
              <DragOverlayCard class="rounded-md border border-border bg-card p-3">
                <span class="text-sm font-medium">{n()}</span>
              </DragOverlayCard>
            )}
          </Show>
        )
      }}
    </DragOverlay>
  )
}
