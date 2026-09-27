import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import { type ColumnFormDialogProps } from './launcher-settings-form-types.js'
import { ColumnFormContent } from './ColumnFormContent.js'

export function ColumnFormDialog(props: ColumnFormDialogProps): JSX.Element {
  return <ErrorScope active={!!props.form}><ColumnFormContent {...props} /></ErrorScope>
}
