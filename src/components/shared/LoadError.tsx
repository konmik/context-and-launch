import type { JSX } from '@solidjs/web'
import { createSignal } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorDialog from './ErrorDialog.js'

export default function LoadError(props: { error: UserFacingError; onRetry(): void }): JSX.Element {
  const [dismissed, setDismissed] = createSignal(false)
  return (
    <>
      <div class="mx-auto mt-10 max-w-2xl rounded-lg border border-destructive/40 bg-card p-6">
        <h2 class="mb-4 text-lg font-semibold">{props.error.title}</h2>
        <div class="flex gap-2">
          <button type="button" class="btn-primary" onClick={props.onRetry}>Retry</button>
          <button type="button" class="btn-secondary" onClick={() => setDismissed(false)}>Error details</button>
        </div>
      </div>
      <ErrorDialog error={dismissed() ? undefined : props.error} onClose={() => setDismissed(true)} />
    </>
  )
}
