import { useContext } from 'solid-js'
import { type JSX } from '@solidjs/web'
import { type MenuButtonProps } from './menu-context.js'
import { MenuContext } from './menu-context.js'

export function MenuItem(
  props: MenuButtonProps & {
    value?: string
    closeOnSelect?: boolean
  },
): JSX.Element {
  const menu = useContext(MenuContext)
  return (
    <button
      type="button"
      {...props}
      role="menuitem"
      data-scope="menu"
      data-part="item"
      data-disabled={props.disabled ? '' : null}
      onClick={(event) => {
        props.onClick?.(event)
        if (props.closeOnSelect !== false) menu.close(true)
      }}
    />
  )
}
