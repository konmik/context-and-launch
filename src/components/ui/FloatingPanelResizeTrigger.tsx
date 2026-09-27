import { useContext } from 'solid-js'
import { type JSX } from '@solidjs/web'
import { PanelContext } from './floating-panel-context.js'

export function FloatingPanelResizeTrigger(): JSX.Element {
  const panel = useContext(PanelContext)
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
      }}
      data-scope="floating-panel"
      data-part="resize-trigger"
      data-axis="se"
      onPointerDown={panel.startResize}
    />
  )
}
