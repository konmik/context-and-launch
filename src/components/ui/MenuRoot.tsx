import { Show, createSignal } from 'solid-js'
import { Portal, type JSX } from '@solidjs/web'
import { createDropdownOverlay } from './overlay.js'
import { type MenuContextValue } from './menu-context.js'
import { MenuContext } from './menu-context.js'

export function MenuRoot(props: { children: JSX.Element; trigger: JSX.Element }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const context: MenuContextValue = {
    open,
    toggle: () => setOpen((value) => !value),
    close: (restoreFocus = false) => {
      setOpen(false)
      if (restoreFocus) overlay.restoreFocus(context.trigger)
    },
    position: () => {
      const rect = context.trigger?.getBoundingClientRect()
      return {
        left: Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - 208)),
        top: Math.min(rect?.bottom ?? 8, window.innerHeight - 8),
      }
    },
  }
  const overlay = createDropdownOverlay({
    open,
    dismiss: () => context.close(),
    trigger: () => context.trigger,
    content: () => context.content,
  })
  return (
    <MenuContext value={context}>
      {props.trigger}
      <Show when={open()}>
        <Portal>{props.children}</Portal>
      </Show>
    </MenuContext>
  )
}
