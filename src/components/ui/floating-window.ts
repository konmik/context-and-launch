import type { FloatingPanelSize } from './floating-panel-state.js'
import { type JSX } from '@solidjs/web'
import { type FloatingPanelPosition as Position, type FloatingPanelSize as Size } from './floating-panel-state.js'

export type FloatingWindowProps = {
  open: boolean
  onOpenChange?: (details: { open: boolean }) => void
  defaultSize?: Size
  minSize?: Size
  maxSize?: Size
  defaultPosition?: Position
  onPositionChangeEnd?: (details: { position: Position }) => void
  onSizeChangeEnd?: (details: { size: Size }) => void
  persistRect?: boolean
  fitContent?: boolean
  children: JSX.Element
}

export const FLOATING_WINDOW_MIN_SIZE = {
  width: 400,
  height: 300,
}

export function tallWindowDefaultSize(): FloatingPanelSize {
  return {
    width: 768,
    height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8),
  }
}
