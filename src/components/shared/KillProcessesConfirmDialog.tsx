import type { JSX } from '@solidjs/web'
import { Show, For } from 'solid-js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'
import type { LockingProcessInfo } from '~/core/worktree/agent-worktree.js'

export function KillProcessesConfirmDialog(props: {
  open: boolean
  processes: LockingProcessInfo[] | undefined
  killing: boolean
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
      <DialogTitle>Kill Locking Processes</DialogTitle>
      <Show
        when={props.processes !== undefined}
        fallback={<p class="animate-pulse text-sm text-muted-foreground">Finding locking processes...</p>}
      >
        <Show
          when={props.processes!.length > 0}
          fallback={
            <DialogDescription>
              Could not identify the locking processes. Close any editors or terminals using this folder, then try again.
            </DialogDescription>
          }
        >
          <DialogDescription>Killing these processes may cause unsaved work to be lost.</DialogDescription>
          <ul class="my-3 space-y-1">
            <For each={props.processes}>
              {(p) => (
                <li class="text-sm">
                  {p.processName} <span class="text-muted-foreground">(PID {p.pid})</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary" data-testid="kill-processes-cancel">
          Cancel
        </button>
        <Show when={props.processes && props.processes.length > 0}>
          <button
            type="button"
            disabled={props.killing}
            onClick={props.onConfirm}
            class="btn-destructive"
            data-testid="kill-processes-confirm"
          >
            Kill All
          </button>
        </Show>
      </div>
    </DialogRoot>
  )
}
