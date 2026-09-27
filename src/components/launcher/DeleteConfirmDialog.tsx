import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogForm } from '../ui/DialogForm.js'
import { type DeleteTarget } from './launcher-settings-form-types.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'

export function DeleteConfirmDialog(props: {
  deleteConfirm: DeleteTarget | null
  setDeleteConfirm: (target: DeleteTarget | null) => void
  onDeleteBoard: () => void
  onDeleteColumn: () => void
}): JSX.Element {
  return (
    <DialogRoot open={!!props.deleteConfirm} onOpenChange={() => props.setDeleteConfirm(null)} class="max-w-sm p-0">
      <DialogForm state={props.deleteConfirm}>
        {(dc) => (
          <>
            <DialogHeader title={`Delete ${dc().type === 'board' ? 'Board' : 'Column'}`} />
            <div class="px-6 py-4">
              <p class="text-sm" data-testid="launcher-settings-columns-delete-confirm-message">
                {dc().type === 'board'
                  ? `Delete board "${dc().name}"? This cannot be undone.`
                  : `Delete column "${dc().name}"? Tickets with this status ` + 'will appear in the undefined column.'}
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => props.setDeleteConfirm(null)}
                class="btn-secondary"
                data-testid="launcher-settings-columns-delete-cancel"
              >
                Cancel
              </button>
              <button
                onClick={dc().type === 'board' ? props.onDeleteBoard : props.onDeleteColumn}
                class="btn-primary bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="launcher-settings-columns-delete-confirm-btn"
              >
                Delete
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}
