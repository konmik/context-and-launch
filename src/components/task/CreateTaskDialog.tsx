import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { CreateTaskController } from './create-task-controller.js'
import { CreateTaskForm } from './CreateTaskForm.js'

export interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (number: string, title: string) => Promise<Result<undefined, UserFacingError>>
  suggestedNextNumber?: string | null
  projectSlug: string
  ctrl?: CreateTaskController
}

export default function CreateTaskDialog(props: CreateTaskDialogProps): JSX.Element {
  return (
    <ErrorScope active={props.open}>
      <CreateTaskForm {...props} />
    </ErrorScope>
  )
}
