import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'

export function ExternalChangeDialog(props: { open: boolean; label: string; onOverwrite: () => void; onDiscard: () => void }): JSX.Element {
  return (
    <DialogRoot open={props.open} onOpenChange={props.onDiscard} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>File Changed on Disk</DialogTitle>
      <DialogDescription>
        {props.label} changed on disk while you were editing it. Overwrite it with your version, or discard your changes and load the
        version on disk?
      </DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onDiscard} class="btn-secondary" data-testid="task-detail-external-change-discard">
          Discard Mine
        </button>
        <button type="button" onClick={props.onOverwrite} class="btn-destructive" data-testid="task-detail-external-change-overwrite">
          Overwrite
        </button>
      </div>
    </DialogRoot>
  )
}
