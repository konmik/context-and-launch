import type { JSX } from '@solidjs/web'
import { createSignal, Show } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorDialog from './ErrorDialog.js'

export function FieldErrorMessage(props: { error?: UserFacingError }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false)
  return (
    <>
      <Show when={props.error}>
        {(current) => (
          <div class="mt-1 flex items-start gap-2 text-sm text-destructive" role="alert">
            <p class="whitespace-pre-wrap">{current().description}</p>
            <button type="button" class="btn-icon shrink-0" aria-label="Error details" onClick={() => setExpanded(true)}>
              ?
            </button>
          </div>
        )}
      </Show>
      <ErrorDialog error={expanded() ? props.error : undefined} onClose={() => setExpanded(false)} />
    </>
  )
}
