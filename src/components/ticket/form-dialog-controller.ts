import type { SourceAccessor } from 'solid-js'
import type { Setter } from 'solid-js'
import { createSignal } from 'solid-js'
import type { Result } from '~/util/result.js'

export interface FormDialogDeps<TSubmitArgs extends unknown[]> {
  onSubmit: (...args: TSubmitArgs) => Promise<Result<undefined, string>>
  onOpenChange: (open: boolean) => void
}

export function createFormDialogController<TSubmitArgs extends unknown[]>(
  deps: FormDialogDeps<TSubmitArgs>,
): FormDialogControllerResult<TSubmitArgs> {
  const [submitting, setSubmitting] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal('')

  function close() {
    deps.onOpenChange(false)
    setErrorMsg('')
  }

  async function doSubmit(...args: TSubmitArgs) {
    setSubmitting(true)
    setErrorMsg('')
    try {
      const result = await deps.onSubmit(...args)
      if (result.type === 'Failure') setErrorMsg(result.error)
      else close()
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unknown error')
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
  errorMsg: SourceAccessor<string>
  close: () => void
  doSubmit: (...args: TSubmitArgs) => Promise<void>
  setErrorMsg: Setter<string>
}
