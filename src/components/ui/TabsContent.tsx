import { useContext } from 'solid-js'
import type { ComponentProps, JSX } from '@solidjs/web'
import { TabsContext } from './tabs-context.js'

export function TabsContent(
  props: ComponentProps<'div'> & {
    value: string
  },
): JSX.Element {
  const tabs = useContext(TabsContext)
  return (
    <div
      {...props}
      hidden={tabs.value() !== props.value}
      id={`${tabs.id}-panel-${props.value}`}
      aria-labelledby={`${tabs.id}-tab-${props.value}`}
      role="tabpanel"
      data-scope="tabs"
      data-part="content"
    />
  )
}
