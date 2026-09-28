import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { CreateTicketController } from './create-ticket-controller.js'
import { CreateTicketForm } from './CreateTicketForm.js'

export interface CreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (number: string, title: string) => Promise<Result<undefined, UserFacingError>>
  suggestedNextNumber?: string | null
  projectSlug: string
  ctrl?: CreateTicketController
}

export default function CreateTicketDialog(props: CreateTicketDialogProps): JSX.Element {
  return (
    <ErrorScope active={props.open}>
      <CreateTicketForm {...props} />
    </ErrorScope>
  )
}
