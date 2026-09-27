import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import { type ItemFormDialogProps } from './launcher-settings-form-types.js'
import { ItemFormContent } from './ItemFormContent.js'

export function ItemFormDialog(props: ItemFormDialogProps): JSX.Element {
  return <ErrorScope active={!!props.form}><ItemFormContent {...props} /></ErrorScope>
}
