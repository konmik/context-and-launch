import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'

export function ConfirmUploadDialog(props: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  confirmClass: string
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <DialogRoot open={props.open} onOpenChange={props.onCancel} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogDescription>{props.description}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} class="btn-secondary" data-testid="task-detail-confirm-upload-cancel">
          Cancel
        </button>
        <button type="button" onClick={props.onConfirm} class={props.confirmClass} data-testid="task-detail-confirm-upload-confirm">
          {props.confirmLabel}
        </button>
      </div>
    </DialogRoot>
  )
}
