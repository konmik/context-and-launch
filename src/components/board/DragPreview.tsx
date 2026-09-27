import type { JSX } from '@solidjs/web'
import { joinClass } from '~/lib/class-util'
import { DND_PREVIEW_CLASS } from './dnd-shared.js'

export function DragPreview(props: { class?: string; children: JSX.Element }): JSX.Element {
  return (
    <div data-drop-indicator data-drop-preview class={joinClass(DND_PREVIEW_CLASS, props.class)}>
      {props.children}
    </div>
  )
}
