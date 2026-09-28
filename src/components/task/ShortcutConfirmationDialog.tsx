import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import type { ShortcutConfirmation } from './task-detail-shortcuts.js'

export function ShortcutConfirmationDialog(props: {
  info: ShortcutConfirmation | undefined
  running: boolean
  onCancel: () => void
  onProceed: (name: string) => void
}): JSX.Element {
  return (
    <DialogRoot open={!!props.info} onOpenChange={props.onCancel} class="max-w-sm">
      <DialogTitle class="sr-only">{props.info?.type === 'behindRemote' ? 'Main Branch Behind Remote' : 'Uncommitted Changes'}</DialogTitle>
      <p class="mb-4 text-sm">{props.info?.message}</p>
      <div class="flex justify-end gap-2">
        <button onClick={props.onCancel} class="btn-secondary" data-testid="task-detail-shortcut-confirmation-cancel">
          Cancel
        </button>
        <button
          onClick={() => props.onProceed(props.info!.name)}
          disabled={props.running}
          class="btn-primary"
          data-testid="task-detail-shortcut-confirmation-proceed"
        >
          {props.info?.type === 'behindRemote' ? 'Proceed' : 'Run Anyway'}
        </button>
      </div>
    </DialogRoot>
  )
}
