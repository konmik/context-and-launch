import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { DialogContext } from './dialog-context.js'

export function DialogTitle(props: ComponentProps<'h2'>): JSX.Element {
  const dialog = useContext(DialogContext)
  return <h2 {...props} id={dialog.titleId} data-scope="dialog" data-part="title" />
}
