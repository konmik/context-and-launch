import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { PanelContext } from './floating-panel-context.js'

export function FloatingPanelCloseTrigger(props: ComponentProps<'button'>): JSX.Element {
  const panel = useContext(PanelContext)
  return (
    <button
      type="button"
      {...props}
      aria-label={props['aria-label'] ?? 'Close window'}
      data-scope="floating-panel"
      data-part="close-trigger"
      onClick={panel.close}
    />
  )
}
