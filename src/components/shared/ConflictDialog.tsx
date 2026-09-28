import type { JSX } from '@solidjs/web'
import { Show, For } from 'solid-js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'
import { createConflictDialogController, type ConflictDialogController } from './conflict-dialog-controller.js'
import { openConfigDir } from './shared-api.js'
import { useErrorReporter } from './error-presentation.js'

interface ConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolve: (profileName: string) => Promise<void>
  onAbort: () => Promise<void>
  projectSlug: string
  hasConflict: boolean
  ctrl?: ConflictDialogController
}

export default function ConflictDialog(props: ConflictDialogProps): JSX.Element {
  const errors = useErrorReporter(() => props.open)
  const s =
    props.ctrl ??
    createConflictDialogController({
      onError: errors.report,
      projectSlug: () => props.projectSlug,
      onResolve: props.onResolve,
      onAbort: props.onAbort,
      onOpenChange: props.onOpenChange,
    })
  return (
    <DialogRoot open={props.open} onOpenChange={s.close} closeOnInteractOutside={false}>
      <DialogTitle>Sync Conflicts Detected</DialogTitle>
      <DialogDescription>
        Sync detected that your local changes conflict with the remote. Your working tree was left untouched. You can launch an AI agent to
        rebase and resolve the conflicts, or close and retry later.
      </DialogDescription>

      <div class="mb-4">
        <label class="field-label">Profile</label>
        <select
          value={s.selectedProfile()}
          onChange={(e) => s.selectProfile(e.currentTarget.value)}
          class="input input-sm"
          data-testid="conflict-dialog-profile-select"
        >
          <For each={s.profiles()}>{(p) => <option value={p.name}>{p.name}</option>}</For>
        </select>
      </div>

      <div class="flex items-center justify-between">
        <button
          type="button"
          onClick={() => errors.runAndReportErrors(() => openConfigDir('tasks', props.projectSlug))}
          class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          title="Open tasks directory"
          data-testid="conflict-dialog-open-tasks-repo"
        >
          Tasks repo ↗
        </button>
        <div class="flex gap-2">
          <button type="button" onClick={s.close} disabled={s.submitting()} class="btn-secondary" data-testid="conflict-dialog-close">
            Close
          </button>
          <Show when={props.hasConflict}>
            <button type="button" onClick={s.abort} disabled={s.submitting()} class="btn-secondary" data-testid="conflict-dialog-abort">
              Abort
            </button>
          </Show>
          <button
            type="button"
            onClick={s.resolve}
            disabled={s.submitting() || !s.selectedProfile()}
            class="btn-primary"
            data-testid="conflict-dialog-launch"
          >
            Launch
          </button>
        </div>
      </div>
    </DialogRoot>
  )
}
