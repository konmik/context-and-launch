import { useContext } from 'solid-js'
import { type ComponentProps, type JSX } from '@solidjs/web'
import { DialogContext } from './dialog-context.js'

export function DialogCloseTrigger(props: ComponentProps<'button'>): JSX.Element {
  const dialog = useContext(DialogContext)
  return <button type="button" {...props} data-scope="dialog" data-part="close-trigger" onClick={dialog.close} />
}
