import type { SourceAccessor } from 'solid-js'
import { createSignal } from 'solid-js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { errorPayload } from '~/core/shared/errors.js'

export interface FormDialogDeps<TSubmitArgs extends unknown[]> {
  onSubmit: (...args: TSubmitArgs) => Promise<Result<undefined, UserFacingError>>
  onOpenChange: (open: boolean) => void
  onError: (error: UserFacingError) => void
  onClearError?: () => void
}

export function createFormDialogController<TSubmitArgs extends unknown[]>(
  deps: FormDialogDeps<TSubmitArgs>,
): FormDialogControllerResult<TSubmitArgs> {
  const [submitting, setSubmitting] = createSignal(false)

  function close() {
    deps.onClearError?.()
    deps.onOpenChange(false)
  }

  async function doSubmit(...args: TSubmitArgs) {
    deps.onClearError?.()
    setSubmitting(true)
    try {
      const result = await deps.onSubmit(...args)
      if (result.type === 'Failure') deps.onError(result.error)
      else close()
    } catch (err) {
      deps.onError(errorPayload(err))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    submitting,
    close,
    doSubmit,
  }
}

export interface FormDialogControllerResult<TSubmitArgs extends unknown[]> {
  submitting: SourceAccessor<boolean>
  close: () => void
  doSubmit: (...args: TSubmitArgs) => Promise<void>
}
