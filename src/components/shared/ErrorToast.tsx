import { Portal, type JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { X } from '~/components/ui/icons.js'

interface ErrorToastProps {
  error?: UserFacingError
  onClose: () => void
}

export default function ErrorToast(props: ErrorToastProps): JSX.Element {
  return (
    <Show when={props.error}>
      {(error) => (
        <Portal>
          <div class="fixed right-4 bottom-4 max-h-[80vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-destructive bg-card p-4 text-card-foreground shadow-lg">
            <button type="button" class="btn-icon absolute right-2 top-2" onClick={props.onClose} aria-label="Close error toast" title="Close">
              <X size={16} />
            </button>
            <div class="pr-8" role="alert" aria-atomic="true">
              <h2 class="break-words text-sm font-semibold">{error().title}</h2>
              <p class="mt-1 whitespace-pre-wrap break-words text-sm">{error().description}</p>
            </div>
            <Show when={error().details}>
              {(details) => (
                <details class="mt-3 text-sm">
                  <summary class="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">Details</summary>
                  <pre class="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{details()}</pre>
                </details>
              )}
            </Show>
            <div class="mt-3 flex justify-end">
              <button type="button" class="btn-secondary" onClick={props.onClose} aria-label="Dismiss error">
                Dismiss
              </button>
            </div>
          </div>
        </Portal>
      )}
    </Show>
  )
}
