import { Show, createMemo } from 'solid-js'
import { type JSX } from '@solidjs/web'

export function DialogForm<T extends object>(props: {
  state: T | null | undefined
  children: (state: () => T) => JSX.Element
}): JSX.Element {
  return (
    <Show when={props.state}>
      {(opened) => {
        const initial = opened()
        const state = createMemo<T>((previous) => props.state ?? previous ?? initial)
        return props.children(state)
      }}
    </Show>
  )
}
