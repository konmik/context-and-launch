import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import { type CreateBoardDialogProps } from './launcher-settings-form-types.js'
import { CreateBoardContent } from './CreateBoardContent.js'

export function CreateBoardDialog(props: CreateBoardDialogProps): JSX.Element {
  return <ErrorScope active={props.open}><CreateBoardContent {...props} /></ErrorScope>
}
