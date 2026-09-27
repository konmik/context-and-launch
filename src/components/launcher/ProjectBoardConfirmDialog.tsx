import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogForm } from '../ui/DialogForm.js'
import { type BoardRef } from '../board/board-api.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'

export function ProjectBoardConfirmDialog(props: {
  projectBoardConfirm: BoardRef | null
  setProjectBoardConfirm: (target: BoardRef | null) => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <DialogRoot open={!!props.projectBoardConfirm} onOpenChange={() => props.setProjectBoardConfirm(null)} class="max-w-sm p-0">
      <DialogForm state={props.projectBoardConfirm}>
        {(pbc) => (
          <>
            <DialogHeader title="Set Project Board" />
            <div class="px-6 py-4">
              <p class="text-sm" data-testid="launcher-settings-columns-set-project-board-message">
                Set "{pbc().name}" as the board for this project? Tickets whose status is not a column in this board will appear in the
                undefined column and must be updated manually.
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => props.setProjectBoardConfirm(null)}
                class="btn-secondary"
                data-testid="launcher-settings-columns-set-project-board-cancel-btn"
              >
                Cancel
              </button>
              <button onClick={props.onConfirm} class="btn-primary" data-testid="launcher-settings-columns-set-project-board-confirm-btn">
                Set board
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}
