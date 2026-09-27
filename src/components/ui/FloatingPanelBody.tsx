import { type ComponentProps, type JSX } from '@solidjs/web'

export function FloatingPanelBody(props: ComponentProps<'div'>): JSX.Element {
  return <div {...props} data-scope="floating-panel" data-part="body" />
}
