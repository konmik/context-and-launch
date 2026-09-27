import type { SourceAccessor } from 'solid-js'
import type { Setter } from 'solid-js'
import { createSignal } from 'solid-js'

export interface FormDialogDeps<TSubmitArgs extends unknown[]> {
  onSubmit: (...args: TSubmitArgs) => Promise<{
    error?: string
  }>
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
      if (result?.error) setErrorMsg(result.error)
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
