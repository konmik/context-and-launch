import { createUniqueId } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { TabsContext } from './tabs-context.js'

export function TabsRoot(props: {
  value: string
  onValueChange: (details: { value: string }) => void
  children: JSX.Element
  class?: string
  onMouseDown?: (e: MouseEvent) => void
}): JSX.Element {
  const id = createUniqueId()
  return (
    <TabsContext
      value={{
        id,
        value: () => props.value,
        select: (value) =>
          props.onValueChange({
            value,
          }),
      }}
    >
      <div class={props.class} onMouseDown={props.onMouseDown} data-scope="tabs" data-part="root">
        {props.children}
      </div>
    </TabsContext>
  )
}
