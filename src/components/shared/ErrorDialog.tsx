import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

interface ErrorDialogProps {
  error: UserFacingError | null | undefined
  onClose: () => void
}

export default function ErrorDialog(props: ErrorDialogProps): JSX.Element {
  return (
    <DialogRoot open={!!props.error} onOpenChange={props.onClose} class="flex max-h-[80vh] max-w-lg flex-col p-0">
      <div class="flex-none px-6 pt-6 pb-2">
        <DialogTitle class="mb-0 text-sm">{props.error?.title}</DialogTitle>
      </div>
      <div class="flex-1 overflow-y-auto px-6">
        <p class="text-sm text-foreground">{props.error?.description}</p>
        <Show when={props.error?.details}>
          {(details) => (
            <div class="mt-2">
              <p class="mb-1 text-xs text-muted-foreground">Details</p>
              <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted px-3 py-2 text-xs">{details()}</pre>
            </div>
          )}
        </Show>
      </div>
      <div class="flex flex-none justify-end px-6 pt-4 pb-6">
        <button onClick={props.onClose} class="btn-primary" data-testid="error-dialog-ok">
          OK
        </button>
      </div>
    </DialogRoot>
  )
}
