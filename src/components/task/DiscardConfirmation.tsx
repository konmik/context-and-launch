import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'
import { useModEnterSubmit, modEnterHint } from '~/lib/use-mod-enter-submit'

export function DiscardConfirmation(props: { open: boolean; message: string; onCancel: () => void; onDiscard: () => void }): JSX.Element {
  useModEnterSubmit({
    onSubmit: () => props.onDiscard(),
    disabled: () => false,
    active: () => props.open,
  })
  return (
    <DialogRoot open={props.open} onOpenChange={props.onCancel} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>Unsaved Changes</DialogTitle>
      <DialogDescription>{props.message}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} class="btn-secondary" data-testid="task-detail-discard-cancel">
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onDiscard}
          title={modEnterHint()}
          class="btn-destructive"
          data-testid="task-detail-discard-discard"
        >
          Discard
        </button>
      </div>
    </DialogRoot>
  )
}
