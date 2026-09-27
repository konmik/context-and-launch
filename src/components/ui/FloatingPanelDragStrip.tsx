import { useContext } from 'solid-js'
import { type JSX } from '@solidjs/web'
import { PanelContext } from './floating-panel-context.js'

export function FloatingPanelDragStrip(props?: { 'data-testid'?: string }): JSX.Element {
  const panel = useContext(PanelContext)
  return (
    <div
      class="drag-strip"
      role="presentation"
      aria-label="Drag to move window"
      data-scope="floating-panel"
      data-part="drag-trigger"
      data-testid={props?.['data-testid']}
      onPointerDown={panel.startMove}
    />
  )
}
