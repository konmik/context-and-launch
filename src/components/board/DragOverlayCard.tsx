import type { JSX } from '@solidjs/web'
import { joinClass } from '~/lib/class-util'
import { DND_OVERLAY_CLASS } from './dnd-shared.js'

export function DragOverlayCard(props: { class?: string; style?: JSX.CSSProperties; children: JSX.Element }): JSX.Element {
  return (
    <div class={joinClass(DND_OVERLAY_CLASS, props.class)} style={props.style}>
      {props.children}
    </div>
  )
}
