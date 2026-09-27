import { useContext } from 'solid-js'
import { type JSX } from '@solidjs/web'
import { type MenuButtonProps } from './menu-context.js'
import { MenuContext } from './menu-context.js'

export function MenuTrigger(props: MenuButtonProps): JSX.Element {
  const menu = useContext(MenuContext)
  return (
    <button
      ref={(element) => {
        menu.trigger = element
      }}
      type="button"
      {...props}
      aria-haspopup="menu"
      aria-expanded={menu.open() ? 'true' : 'false'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(event) => {
        props.onClick?.(event)
        menu.toggle()
      }}
    />
  )
}
