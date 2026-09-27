import { Portal } from '@solidjs/web'
import { Show, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { DragItem } from './drag-types.js'
import { DragContext } from './drag-context.js'

export function DragOverlay(props: { children: (active?: DragItem) => JSX.Element }): JSX.Element {
  const drag = useContext(DragContext)
  return (
    <Show when={drag.active()}>
      {(item) => (
        <Portal>
          <div
            class="pointer-events-none fixed"
            style={{
              left: `${drag.position()?.x ?? 0}px`,
              top: `${drag.position()?.y ?? 0}px`,
            }}
          >
            {props.children(item())}
          </div>
        </Portal>
      )}
    </Show>
  )
}
