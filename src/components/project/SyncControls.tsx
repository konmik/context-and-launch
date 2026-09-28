import type { JSX } from '@solidjs/web'
import { createMemo, createEffect, Show } from 'solid-js'
import { revalidate } from '@solidjs/router'
import { Check } from '~/components/ui/icons/Check.js'
import { RefreshCw } from '~/components/ui/icons/RefreshCw.js'
import ConflictDialog from '../shared/ConflictDialog.js'
import { projectSyncRevalidateKeys } from '../shared/revalidate-keys.js'
import type { ProjectPageController } from './project-page-controller.js'
import type { SyncStatus } from './project-api.js'

interface SyncControlsProps {
  syncState: ProjectPageController['syncState']
  dialogState: ProjectPageController['dialogState']
  commands: ProjectPageController['commands']
  syncStatus?: SyncStatus
  hasPendingChanges: boolean
  projectSlug: string
}

export default function SyncControls(props: SyncControlsProps): JSX.Element {
  const hasConflict = createMemo(() => props.syncState().conflictDetected || (props.syncStatus?.hasConflict ?? false))
  createEffect(hasConflict, (conflict) => {
    if (!conflict) return
    const timer = setInterval(() => void revalidate(projectSyncRevalidateKeys), 5000)
    return () => clearInterval(timer)
  })
  return (
    <>
      <button
        onClick={(event) => {
          if (hasConflict()) props.commands.setConflictDialogOpen(true)
          else {
            event.currentTarget.disabled = true
            void props.commands.handleSync()
          }
        }}
        disabled={props.syncState().syncing}
        class={`btn-icon relative ${hasConflict() ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}`}
        title={hasConflict() ? 'Resolve conflicts' : 'Sync tasks'}
        data-testid="sync-button-trigger"
      >
        <Show when={props.syncState().syncSuccess} fallback={<RefreshCw size={16} />}>
          <Check size={16} data-testid="sync-button-check-icon" />
        </Show>
        <Show when={hasConflict()}>
          <span
            class={
              'absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center' +
              ' rounded-full bg-destructive text-[8px] font-bold leading-none' +
              ' text-destructive-foreground'
            }
            data-testid="sync-button-conflict-badge"
          >
            !
          </span>
        </Show>
        <Show when={props.hasPendingChanges && !hasConflict()}>
          <span class="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warning" data-testid="sync-button-pending-badge" />
        </Show>
      </button>
      <ConflictDialog
        open={props.dialogState().conflictDialogOpen}
        onOpenChange={props.commands.setConflictDialogOpen}
        onResolve={props.commands.handleConflictResolve}
        onAbort={props.commands.handleConflictAbort}
        projectSlug={props.projectSlug}
        hasConflict={hasConflict()}
      />
    </>
  )
}
