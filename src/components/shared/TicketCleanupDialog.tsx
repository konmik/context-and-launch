import type { JSX } from '@solidjs/web'
import type { Result } from '~/util/result.js'
import { Show, For, createEffect } from 'solid-js'
import { X } from '~/components/ui/icons/X.js'
import { FloatingWindow } from '../ui/FloatingWindow.js'
import { FloatingWindowHeader } from '../ui/FloatingWindowHeader.js'
import { FloatingPanelBody } from '../ui/FloatingPanelBody.js'
import { FloatingPanelCloseTrigger } from '../ui/FloatingPanelCloseTrigger.js'
import { FloatingPanelTitle } from '../ui/FloatingPanelTitle.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import type { ErrorInfo } from '~/core/shared/errors.js'
import type { CleanupItemKey } from '~/core/worktree/ticket-cleanup-checks.js'
import { useModEnterSubmit, modEnterHint } from '~/lib/use-mod-enter-submit'
import {
  getCleanupStatus,
  getWorktreeLockingProcesses,
  killWorktreeLockingProcesses,
  forceDeleteLocalBranch,
} from '~/components/ticket/ticket-api.js'
import type { TicketCleanupOptions } from './ticket-cleanup-pure.js'
import { createTicketCleanupController } from './ticket-cleanup-controller.js'
import { FieldErrorMessage } from './FieldErrorMessage.js'
import { useErrorReporter } from './error-presentation.js'
import { KillProcessesConfirmDialog } from './KillProcessesConfirmDialog.js'
import { ForceDeleteBranchDialog } from './ForceDeleteBranchDialog.js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'

interface TicketCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectSlug: string
  ticket: TicketInfo | null
  action: 'archive' | 'delete'
  onCleanup: (folderName: string, cleanup: TicketCleanupOptions) => Promise<Result<undefined, ErrorInfo>>
  onSubmit: (folderName: string) => Promise<Result<undefined, ErrorInfo>>
}

const rows: {
  key: CleanupItemKey
  resource: string
  label: string
  confirmation: string
  testId: string
}[] = [
  {
    key: 'stopHerdrAgent',
    resource: 'Agent',
    label: 'Stop agent',
    confirmation: 'Stop the agent running for this task?',
    testId: 'ticket-cleanup-stop-herdr',
  },
  {
    key: 'deleteWorktree',
    resource: 'Worktree',
    label: 'Delete worktree',
    confirmation: "Delete this task's worktree folder and its files?",
    testId: 'ticket-cleanup-delete-worktree',
  },
  {
    key: 'deleteLocalBranch',
    resource: 'Local branch',
    label: 'Delete local branch',
    confirmation: "Delete this task's local Git branch?",
    testId: 'ticket-cleanup-delete-local',
  },
  {
    key: 'deleteRemoteBranch',
    resource: 'Remote branch',
    label: 'Delete remote branch',
    confirmation: "Delete this task's branch from the remote repository?",
    testId: 'ticket-cleanup-delete-remote',
  },
]

export default function TicketCleanupDialog(props: TicketCleanupDialogProps): JSX.Element {
  const errors = useErrorReporter(() => props.open)
  const s = createTicketCleanupController({
    onError: errors.report,
    projectSlug: () => props.projectSlug,
    ticket: () => props.ticket,
    action: () => props.action,
    loadStatus: getCleanupStatus,
    onCleanup: props.onCleanup,
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    loadLockingProcesses: getWorktreeLockingProcesses,
    killLockingProcesses: killWorktreeLockingProcesses,
    forceDeleteLocalBranch,
  })
  createEffect(
    () => [props.open, props.ticket] as const,
    ([open, ticket]) => {
      s.closeConfirmation()
      if (open && ticket) void s.startChecks()
    },
  )
  useModEnterSubmit({
    onSubmit: () => s.requestConfirmation(props.action),
    disabled: s.busy,
    active: () => props.open && !!props.ticket && !s.confirmation() && !s.killDialogOpen() && !s.forceDeleteDialogOpen(),
  })
  return (
    <>
      <FloatingWindow
        open={props.open && !!props.ticket}
        onOpenChange={(d) => {
          if (!d.open) s.close()
        }}
        defaultSize={{
          width: 600,
          height: 560,
        }}
        minSize={{
          width: 380,
          height: 300,
        }}
        persistRect
      >
        <FloatingWindowHeader
          title={<FloatingPanelTitle>{s.actionLabel()} task</FloatingPanelTitle>}
          actions={
            <FloatingPanelCloseTrigger aria-label="Close">
              <X size={16} />
            </FloatingPanelCloseTrigger>
          }
        />
        <FloatingPanelBody>
          <div class="min-h-0 flex-1 overflow-auto px-6 pt-1 pb-4">
            <p class="mb-4 break-words text-sm text-muted-foreground">
              {props.ticket?.number} - {props.ticket?.title}
            </p>

            <section aria-label="Optional cleanup">
              <table class="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col class="w-52" />
                  <col />
                </colgroup>
                <tbody class="divide-y divide-border">
                  <For each={rows}>
                    {(row) => {
                      const item = () => s.items()[row.key]
                      const running = () => s.runningItem() === row.key
                      const blockedItem = () => {
                        const value = item()
                        return value.state === 'blocked' ? value : undefined
                      }
                      const errorItem = () => {
                        const value = item()
                        return value.state === 'error' ? value : undefined
                      }
                      const checks = () => {
                        const value = item()
                        return value.state === 'checking' ? [] : value.checks
                      }
                      return (
                        <tr class="align-top">
                          <td class="py-3 pr-2">
                            <Show when={blockedItem()}>
                              {(blocked) => (
                                <>
                                  <Show when={blocked().killable}>
                                    <button
                                      type="button"
                                      onClick={() => void s.openKillDialog()}
                                      disabled={s.busy()}
                                      class="btn-destructive mb-2 h-auto! min-h-10 w-full whitespace-normal break-words"
                                      data-testid="ticket-cleanup-kill-processes"
                                    >
                                      Kill processes
                                    </button>
                                  </Show>
                                  <Show when={blocked().forceDeleteable}>
                                    <button
                                      type="button"
                                      onClick={() => s.openForceDeleteDialog()}
                                      disabled={s.busy()}
                                      class="btn-destructive mb-2 h-auto! min-h-10 w-full whitespace-normal break-words"
                                      data-testid="ticket-cleanup-force-delete-branch"
                                    >
                                      Force delete
                                    </button>
                                  </Show>
                                </>
                              )}
                            </Show>
                            <button
                              type="button"
                              disabled={item().state !== 'ready' || s.busy()}
                              onClick={() => s.requestConfirmation(row.key)}
                              class="btn-secondary h-auto! min-h-10 w-full whitespace-normal break-words"
                              data-testid={`${row.testId}-button`}
                            >
                              {row.label}
                            </button>
                          </td>
                          <td
                            class="py-3 pl-4"
                            data-testid={`${row.testId}-status`}
                            data-state={running() ? 'running' : item().state}
                            aria-live="polite"
                          >
                            <ul class="space-y-1" aria-label={`${row.resource} checks`}>
                              <For each={checks()}>
                                {(check) => (
                                  <li
                                    class={`break-words leading-6 ${check.state === 'blocked' || check.state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
                                  >
                                    {check.detail}
                                  </li>
                                )}
                              </For>
                            </ul>
                            <div class="min-w-0 whitespace-pre-line break-words text-left text-sm leading-5 not-empty:mt-2">
                              <Show
                                when={running()}
                                fallback={
                                  <>
                                    <Show when={item().state === 'checking'}>
                                      <span class="animate-pulse text-muted-foreground">Checking...</span>
                                    </Show>
                                    <Show when={blockedItem()}>
                                      {(blocked) => (
                                        <Show when={!checks().some((check) => check.detail === blocked().reason)}>
                                          <span class={blocked().warning ? 'text-destructive' : 'text-muted-foreground'}>
                                            {blocked().reason}
                                          </span>
                                        </Show>
                                      )}
                                    </Show>
                                    <Show when={errorItem()}>{(error) => <FieldErrorMessage error={error().error} />}</Show>
                                  </>
                                }
                              >
                                <span class="animate-pulse text-muted-foreground">Working...</span>
                              </Show>
                            </div>
                          </td>
                        </tr>
                      )
                    }}
                  </For>
                </tbody>
              </table>
            </section>
          </div>

          <form onSubmit={s.handleSubmit} class="shrink-0 border-t border-border px-6 py-2">
            <div class="flex justify-end gap-2">
              <button
                type="button"
                disabled={s.busy() || rows.some((row) => s.items()[row.key].state === 'checking')}
                onClick={() => void s.startChecks()}
                class="btn-secondary mr-auto"
                data-testid="ticket-cleanup-refresh"
              >
                Refresh
              </button>
              <button type="button" onClick={s.close} class="btn-secondary" data-testid="ticket-cleanup-cancel">
                Cancel
              </button>
              <button
                type="submit"
                disabled={s.busy()}
                title={modEnterHint()}
                class={props.action === 'delete' ? 'btn-destructive' : 'btn-primary'}
                data-testid="ticket-cleanup-submit"
              >
                {s.actionLabel()} task
              </button>
            </div>
          </form>
        </FloatingPanelBody>
      </FloatingWindow>
      <DialogRoot
        open={props.open && !!s.confirmation()}
        onOpenChange={(open) => {
          if (!open) s.closeConfirmation()
        }}
      >
        <Show when={s.confirmation()}>
          {(operation) => {
            const row = () => rows.find((candidate) => candidate.key === operation())
            const label = () => row()?.label ?? (operation() === 'archive' ? 'Archive task' : 'Delete task')
            return (
              <>
                <DialogTitle>{label()}</DialogTitle>
                <DialogDescription>
                  {props.ticket?.number} - {props.ticket?.title}
                  <br />
                  {row()?.confirmation ??
                    (operation() === 'archive'
                      ? 'Move this task to the archive?'
                      : 'Permanently delete this task and its files? This cannot be undone.')}
                </DialogDescription>
                <div class="flex justify-end gap-2">
                  <button type="button" onClick={s.closeConfirmation} class="btn-secondary" data-testid="ticket-cleanup-confirm-cancel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={s.busy()}
                    onClick={() => void s.confirmOperation()}
                    class={operation() === 'archive' ? 'btn-primary' : 'btn-destructive'}
                    data-testid="ticket-cleanup-confirm"
                  >
                    {label()}
                  </button>
                </div>
              </>
            )
          }}
        </Show>
      </DialogRoot>
      <KillProcessesConfirmDialog
        open={s.killDialogOpen()}
        processes={s.lockingProcesses()}
        killing={s.killingProcesses()}
        onConfirm={() => void s.confirmKill()}
        onClose={s.closeKillDialog}
      />
      <ForceDeleteBranchDialog
        open={s.forceDeleteDialogOpen()}
        deleting={s.forceDeleting()}
        onConfirm={() => void s.confirmForceDelete()}
        onClose={s.closeForceDeleteDialog}
      />
    </>
  )
}
