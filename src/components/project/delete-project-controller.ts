import type { SourceAccessor } from 'solid-js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { createFormDialogController } from '../task/form-dialog-controller.js'

export interface DeleteProjectDeps {
  onSubmit: (projectSlug: string) => Promise<Result<undefined, UserFacingError>>
  onError: (error: UserFacingError) => void
  onOpenChange: (open: boolean) => void
  projectSlug: () => string
}

export function createDeleteProjectController(deps: DeleteProjectDeps): DeleteProjectControllerResult {
  const form = createFormDialogController({
    onError: deps.onError,
    onSubmit: deps.onSubmit,
    onOpenChange: deps.onOpenChange,
  })

  async function doSubmit() {
    await form.doSubmit(deps.projectSlug())
  }

  return {
    submitting: form.submitting,
    close: form.close,
    doSubmit,
  }
}

export type DeleteProjectController = ReturnType<typeof createDeleteProjectController>

export interface DeleteProjectControllerResult {
  submitting: SourceAccessor<boolean>
  close: () => void
  doSubmit: () => Promise<void>
}
