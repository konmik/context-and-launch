import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { PanelContext } from './floating-panel-context.js'

export function FloatingPanelTitle(props: ComponentProps<'h2'>): JSX.Element {
  const panel = useContext(PanelContext)
  return <h2 {...props} id={panel.titleId} data-scope="floating-panel" data-part="title" />
}
