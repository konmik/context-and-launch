import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'

export function ForceDeleteBranchDialog(props: {
  open: boolean
  deleting: boolean
  onConfirm: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <DialogRoot
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogTitle>Force Delete Branch</DialogTitle>
      <DialogDescription>This branch has unmerged commits that will be permanently lost.</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary" data-testid="force-delete-branch-cancel">
          Cancel
        </button>
        <button
          type="button"
          disabled={props.deleting}
          onClick={props.onConfirm}
          class="btn-destructive"
          data-testid="force-delete-branch-confirm"
        >
          Force Delete
        </button>
      </div>
    </DialogRoot>
  )
}
