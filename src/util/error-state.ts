import { createSignal, type SourceAccessor } from 'solid-js'
import type { UserFacingError } from './user-facing-error.js'

export interface ErrorState {
  error: SourceAccessor<UserFacingError | undefined>
  setError(error?: UserFacingError | null): void
}

export function createErrorState(report?: (error: UserFacingError) => void, clear?: () => void): ErrorState {
  const [error, setError] = createSignal<UserFacingError>()
  return {
    error,
    setError(value) {
      setError(value ?? undefined)
      if (value) report?.(value)
      else clear?.()
    },
  }
}
