import { createContext } from 'solid-js'

export const PanelContext = createContext<{
  close(): void
  startMove(event: PointerEvent): void
  startResize(event: PointerEvent): void
  titleId: string
}>()
