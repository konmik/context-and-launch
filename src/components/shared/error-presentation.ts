import { createContext, onCleanup, useContext } from 'solid-js'
import { errorPayload } from '~/core/shared/errors.js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { useToastQueue } from './toast-queue.js'

export interface ErrorPresentationCommands {
  report(error: UserFacingError): void
  clear(): void
  register(field: string, show: (error?: UserFacingError) => void): () => void
}

interface ErrorReporter {
  report(error: UserFacingError): void
  enqueueToast(error: UserFacingError): void
  clear(): void
  runAndReportErrors(operation: () => Promise<Result<unknown, UserFacingError>>): Promise<void>
}

export const ErrorPresentationContext = createContext<ErrorPresentationCommands>()

export function useErrorReporter(active: () => boolean = () => true): ErrorReporter {
  const scope = useContext(ErrorPresentationContext)
  const toasts = useToastQueue()
  let mounted = true
  onCleanup(() => {
    mounted = false
  })

  function report(error: UserFacingError) {
    if (mounted && active()) scope.report(error)
    else toasts.enqueue(error)
  }

  return {
    report,
    enqueueToast: toasts.enqueue,
    clear: scope.clear,
    async runAndReportErrors(operation) {
      try {
        const result = await operation()
        if (result.type === 'Failure') report(result.error)
      } catch (error) {
        report(errorPayload(error))
      }
    },
  }
}
