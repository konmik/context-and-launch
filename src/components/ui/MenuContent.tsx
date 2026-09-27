import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { MenuContext } from './menu-context.js'

export function MenuContent(props: ComponentProps<'div'>): JSX.Element {
  const menu = useContext(MenuContext)
  return (
    <div
      {...props}
      ref={(element) => {
        menu.content = element
      }}
      role="menu"
      data-scope="menu"
      data-part="content"
      style={{
        position: 'fixed',
        left: `${menu.position().left}px`,
        top: `${menu.position().top}px`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(event) => {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')]
        if (!items.length) return
        const activeElement = document.activeElement
        const current = activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1
        let next: number | undefined
        if (event.key === 'ArrowDown') next = (current + 1) % items.length
        if (event.key === 'ArrowUp') next = (current <= 0 ? items.length : current) - 1
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = items.length - 1
        if (next === undefined) return
        event.preventDefault()
        items[next].focus()
      }}
    />
  )
}
