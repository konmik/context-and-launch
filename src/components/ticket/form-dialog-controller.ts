import type { SourceAccessor } from 'solid-js'
import { createSignal } from 'solid-js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { createErrorState } from '~/util/error-state.js'
import { errorPayload } from '~/core/shared/errors.js'

export interface FormDialogDeps<TSubmitArgs extends unknown[]> {
  onSubmit: (...args: TSubmitArgs) => Promise<Result<undefined, UserFacingError>>
  onOpenChange: (open: boolean) => void
  onError?: (error: UserFacingError) => void
  onClearError?: () => void
}

export function createFormDialogController<TSubmitArgs extends unknown[]>(
  deps: FormDialogDeps<TSubmitArgs>,
): FormDialogControllerResult<TSubmitArgs> {
  const [submitting, setSubmitting] = createSignal(false)
  const { error: errorMsg, setError: setErrorMsg } = createErrorState(deps.onError)

  function close() {
    deps.onClearError?.()
    deps.onOpenChange(false)
    setErrorMsg()
  }

  async function doSubmit(...args: TSubmitArgs) {
    deps.onClearError?.()
    setSubmitting(true)
    setErrorMsg()
    try {
      const result = await deps.onSubmit(...args)
      if (result.type === 'Failure') setErrorMsg(result.error)
      else close()
    } catch (err) {
      setErrorMsg(errorPayload(err))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    submitting,
    errorMsg,
    close,
    doSubmit,
    setErrorMsg,
  }
}

export interface FormDialogControllerResult<TSubmitArgs extends unknown[]> {
  submitting: SourceAccessor<boolean>
  errorMsg: SourceAccessor<UserFacingError | undefined>
  close: () => void
  doSubmit: (...args: TSubmitArgs) => Promise<void>
  setErrorMsg: (error?: UserFacingError) => void
}
