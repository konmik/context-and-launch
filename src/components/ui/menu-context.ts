import { createContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'

export interface MenuContextValue {
  open: () => boolean
  toggle(): void
  close(restoreFocus?: boolean): void
  position(): {
    left: number
    top: number
  }
  trigger?: HTMLButtonElement
  content?: HTMLDivElement
}

export const MenuContext = createContext<MenuContextValue>()

export type MenuButtonProps = Omit<ComponentProps<'button'>, 'onClick'> & {
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>
}
