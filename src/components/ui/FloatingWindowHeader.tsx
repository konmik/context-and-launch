import { Show } from 'solid-js'
import { type JSX } from '@solidjs/web'

export function FloatingWindowHeader(props: { title?: JSX.Element; actions?: JSX.Element; children?: JSX.Element }): JSX.Element {
  return (
    <div data-scope="floating-panel" data-part="header">
      <div class="flex flex-col gap-3 p-4">
        <div class="flex items-center justify-between gap-4">
          <div class="window-title flex min-w-0 flex-1 items-center gap-1.5">{props.title}</div>
          <Show when={props.actions}>
            <div class="flex shrink-0 items-center gap-1">{props.actions}</div>
          </Show>
        </div>
        {props.children}
      </div>
    </div>
  )
}
