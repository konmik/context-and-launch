import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import { LoaderCircle } from '~/components/ui/icons/LoaderCircle.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { DiffLoadError } from './DiffLoadError.js'

export function DiffScopeUnavailable(props: { error?: UserFacingError; label: string; onRetry(): void }): JSX.Element {
  return (
    <Show
      when={props.error}
      fallback={
        <div class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle size={16} class="mr-2 animate-spin" />
          Calculating {props.label}...
        </div>
      }
    >
      {(message) => <DiffLoadError error={message()} onRetry={props.onRetry} />}
    </Show>
  )
}
