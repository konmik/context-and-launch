import { useContext } from 'solid-js'
import type { ComponentProps, JSX } from '@solidjs/web'
import { TabsContext } from './tabs-context.js'

export function TabsTrigger(
  props: ComponentProps<'button'> & {
    value: string
  },
): JSX.Element {
  const tabs = useContext(TabsContext)
  const selected = () => tabs.value() === props.value
  const tabId = () => `${tabs.id}-tab-${props.value}`
  const panelId = () => `${tabs.id}-panel-${props.value}`
  return (
    <button
      type="button"
      {...props}
      id={tabId()}
      aria-controls={panelId()}
      role="tab"
      tabindex={selected() ? 0 : -1}
      data-scope="tabs"
      data-part="trigger"
      data-selected={selected() ? '' : null}
      aria-selected={selected() ? 'true' : 'false'}
      onClick={() => tabs.select(props.value)}
      onKeyDown={(event) => {
        const tabs = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')]
        const current = tabs.indexOf(event.currentTarget)
        let next: number | undefined
        if (event.key === 'ArrowRight') next = (current + 1) % tabs.length
        if (event.key === 'ArrowLeft') next = (current <= 0 ? tabs.length : current) - 1
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = tabs.length - 1
        if (next === undefined) return
        event.preventDefault()
        tabs[next].click()
        tabs[next].focus()
      }}
    />
  )
}
