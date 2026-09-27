import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import type { AddProjectController, AddProjectAction } from './add-project-controller.js'
import { AddProjectFormContent } from './AddProjectFormContent.js'

export interface AddProjectFormProps {
  action: AddProjectAction
  onSuccess?: (projectSlug: string) => void
  submitTitle?: string
  ctrl?: AddProjectController
}

export default function AddProjectForm(props: AddProjectFormProps): JSX.Element {
  return <ErrorScope active={true}><AddProjectFormContent {...props} /></ErrorScope>
}
