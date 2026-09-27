import { type ComponentProps, type JSX } from '@solidjs/web'

export function MenuSeparator(props: ComponentProps<'div'>): JSX.Element {
  return <div {...props} role="separator" data-scope="menu" data-part="separator" />
}
