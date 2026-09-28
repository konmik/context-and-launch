import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'
import { modEnterHint } from '~/lib/use-mod-enter-submit'

export function DeleteFileDialog(props: { open: boolean; label: string; onDelete: () => void; onClose: () => void }): JSX.Element {
  return (
    <DialogRoot open={props.open} onOpenChange={props.onClose} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>Delete File</DialogTitle>
      <DialogDescription>Delete {props.label}? This cannot be undone.</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary" data-testid="task-detail-delete-file-cancel">
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          title={modEnterHint()}
          class="btn-destructive"
          data-testid="task-detail-delete-file-confirm"
        >
          Delete
        </button>
      </div>
    </DialogRoot>
  )
}
