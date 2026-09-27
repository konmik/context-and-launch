import { omit } from 'solid-js'
import { type JSX } from '@solidjs/web'
import { type FloatingWindowProps } from './floating-window.js'
import { FloatingPanelRoot } from './FloatingPanelRoot.js'
import { FloatingPanelDragStrip } from './FloatingPanelDragStrip.js'
import { FloatingPanelResizeTrigger } from './FloatingPanelResizeTrigger.js'

export function FloatingWindow(props: FloatingWindowProps): JSX.Element {
  const rootProps = omit(props, 'children')
  return (
    <FloatingPanelRoot {...rootProps}>
      <div data-scope="floating-panel" data-part="viewport">
        <FloatingPanelDragStrip />
        {props.children}
      </div>
      <FloatingPanelResizeTrigger />
    </FloatingPanelRoot>
  )
}
