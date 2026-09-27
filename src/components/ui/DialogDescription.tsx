import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { DialogContext } from './dialog-context.js'

export function DialogDescription(props: ComponentProps<'p'>): JSX.Element {
  const dialog = useContext(DialogContext)
  return <p {...props} id={dialog.descriptionId} data-scope="dialog" data-part="description" />
}
