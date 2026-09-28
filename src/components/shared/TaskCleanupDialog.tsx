import type { JSX } from '@solidjs/web'
import { revalidate } from '@solidjs/router'
import type { Result } from '~/util/result.js'
import { Show, For, createEffect, createMemo, createSignal, mapArray } from 'solid-js'
import { taskAgentWorktrees } from '~/core/task/task-worktrees.js'
import { X } from '~/components/ui/icons/X.js'
import { FloatingWindow } from '../ui/FloatingWindow.js'
import { FloatingWindowHeader } from '../ui/FloatingWindowHeader.js'
import { FloatingPanelBody } from '../ui/FloatingPanelBody.js'
import { FloatingPanelCloseTrigger } from '../ui/FloatingPanelCloseTrigger.js'
import { FloatingPanelTitle } from '../ui/FloatingPanelTitle.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import type { CleanupItemKey } from '~/core/worktree/task-cleanup-checks.js'
import { useModEnterSubmit, modEnterHint } from '~/lib/use-mod-enter-submit'
import {
  getCleanupStatus,
  getWorktreeLockingProcesses,
  killWorktreeLockingProcesses,
  forceDeleteLocalBranch,
} from '~/components/task/task-api.js'
import type { TaskCleanupOptions } from './task-cleanup-pure.js'
import { createTaskCleanupController, type TaskCleanupControllerResult } from './task-cleanup-controller.js'
import { FieldErrorMessage } from './FieldErrorMessage.js'
import { useErrorReporter } from './error-presentation.js'
import { KillProcessesConfirmDialog } from './KillProcessesConfirmDialog.js'
import { ForceDeleteBranchDialog } from './ForceDeleteBranchDialog.js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogDescription } from '../ui/DialogDescription.js'
import { taskMutationRevalidateKeys } from './revalidate-keys.js'

interface TaskCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectSlug: string
  task: TaskInfo | null
  action: 'archive' | 'delete'
  onCleanup: (folderName: string, cleanup: TaskCleanupOptions) => Promise<Result<undefined, ErrorInfo>>
  onSubmit: (folderName: string) => Promise<Result<undefined, ErrorInfo>>
}

const rows: {
  key: CleanupItemKey
  label: string
  confirmation: string
  testId: string
}[] = [
  {
    key: 'stopHerdrAgent',
    label: 'Stop agent',
    confirmation: 'Stop the agent running for this task?',
    testId: 'task-cleanup-stop-herdr',
  },
  {
    key: 'deleteWorktree',
    label: 'Delete worktree',
    confirmation: "Delete this task's worktree folder and its files?",
    testId: 'task-cleanup-delete-worktree',
  },
  {
    key: 'deleteLocalBranch',
    label: 'Delete local branch',
    confirmation: "Delete this task's local Git branch?",
    testId: 'task-cleanup-delete-local',
  },
  {
    key: 'deleteRemoteBranch',
    label: 'Delete remote branch',
    confirmation: "Delete this task's branch from the remote repository?",
    testId: 'task-cleanup-delete-remote',
  },
]

export default function TaskCleanupDialog(props: TaskCleanupDialogProps): JSX.Element {
  const sessionKey = createMemo(() => (props.open && props.task ? JSON.stringify([props.projectSlug, props.task.folderName]) : undefined))
  return (
    <FloatingWindow
      open={!!sessionKey()}
      onOpenChange={(event) => props.onOpenChange(event.open)}
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
      <Show when={sessionKey()} keyed>
        {(_sessionKey) => <TaskCleanupSession {...props} />}
      </Show>
    </FloatingWindow>
  )
}

function TaskCleanupSession(props: TaskCleanupDialogProps): JSX.Element {
  const errors = useErrorReporter(() => props.open)
  const [showAll, setShowAll] = createSignal(false)
  const showAllStorageKey = 'task-cleanup:show-all'
  createEffect(
    () => showAllStorageKey,
    (key) => {
      try {
        setShowAll(localStorage.getItem(key) === 'true')
      } catch (error) {
        errors.report(errorPayload(error, 'Could not load cleanup preference'))
      }
    },
  )

  function updateShowAll(value: boolean): void {
    try {
      localStorage.setItem(showAllStorageKey, String(value))
      setShowAll(value)
    } catch (error) {
      errors.report(errorPayload(error, 'Could not save cleanup preference'))
    }
  }

  const worktrees = createMemo(() => (props.task ? taskAgentWorktrees(props.task).filter((worktree) => !worktree.cleanupComplete) : []))
  const targetPaths = createMemo(() => (worktrees().length > 0 ? worktrees().map((worktree) => worktree.worktreePath) : [undefined]))
  const controllers = mapArray(targetPaths, (worktreePath) => {
    const controller = createTaskCleanupController({
      onError: errors.report,
      projectSlug: () => props.projectSlug,
      task: () => props.task,
      action: () => props.action,
      loadStatus: (projectSlug, folderName) => getCleanupStatus(projectSlug, folderName, worktreePath ?? null),
      onCleanup: (folderName, cleanup) =>
        props.onCleanup(
          folderName,
          worktreePath
            ? {
                ...cleanup,
                worktreePath,
              }
            : cleanup,
        ),
      onSubmit: props.onSubmit,
      onOpenChange: props.onOpenChange,
      loadLockingProcesses: (projectSlug, folderName) => getWorktreeLockingProcesses(projectSlug, folderName, worktreePath ?? null),
      killLockingProcesses: killWorktreeLockingProcesses,
      forceDeleteLocalBranch: async (projectSlug, folderName) => {
        const result = await forceDeleteLocalBranch(projectSlug, folderName, worktreePath ?? null)
        await revalidate(taskMutationRevalidateKeys)
        return result
      },
    })
    createEffect(
      () => worktreePath,
      () => void controller.startChecks(),
    )
    return controller
  })
  const s = () => controllers()[0]!
  const busy = () => controllers().some((controller) => controller.busy())
  const confirming = () =>
    controllers().some((controller) => controller.confirmation() || controller.killDialogOpen() || controller.forceDeleteDialogOpen())
  const checking = () => controllers().some((controller) => rows.some((row) => controller.items()[row.key].state === 'checking'))
  useModEnterSubmit({
    onSubmit: () => s().requestConfirmation(props.action),
    disabled: busy,
    active: () => props.open && !!props.task && !confirming(),
  })
  return (
    <>
      <FloatingWindowHeader
        title={<FloatingPanelTitle>{s().actionLabel()} task</FloatingPanelTitle>}
        actions={
          <FloatingPanelCloseTrigger aria-label="Close">
            <X size={16} />
          </FloatingPanelCloseTrigger>
        }
      />
      <FloatingPanelBody>
        <div class="min-h-0 flex-1 overflow-auto px-6 pt-1 pb-4">
          <div class="mb-4 flex items-start justify-between gap-4">
            <p class="min-w-0 break-words text-sm text-muted-foreground">
              {props.task?.number} - {props.task?.title}
            </p>
            <label class="flex shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" checked={showAll()} onChange={(event) => updateShowAll(event.currentTarget.checked)} />
              Show all
            </label>
          </div>
          <section aria-label="Optional cleanup" class="space-y-4">
            <For each={controllers()}>
              {(controller, index) => (
                <TaskCleanupTarget
                  controller={controller}
                  busy={busy()}
                  hideAbsent={!showAll()}
                  open={props.open}
                  task={props.task}
                  worktreePath={targetPaths()[index()]}
                  branchName={worktrees().find((worktree) => worktree.worktreePath === targetPaths()[index()])?.branchName}
                />
              )}
            </For>
          </section>
        </div>

        <form onSubmit={(event) => s().handleSubmit(event)} class="shrink-0 border-t border-border px-6 py-2">
          <div class="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy() || checking()}
              onClick={() => void Promise.all(controllers().map((controller) => controller.startChecks()))}
              class="btn-secondary mr-auto"
              data-testid="task-cleanup-refresh"
            >
              Refresh
            </button>
            <button type="button" onClick={() => s().close()} class="btn-secondary" data-testid="task-cleanup-cancel">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy()}
              title={modEnterHint()}
              class={props.action === 'delete' ? 'btn-destructive' : 'btn-primary'}
              data-testid="task-cleanup-submit"
            >
              {s().actionLabel()} task
            </button>
          </div>
        </form>
      </FloatingPanelBody>
    </>
  )
}

interface TaskCleanupTargetProps {
  controller: TaskCleanupControllerResult
  busy: boolean
  hideAbsent: boolean
  open: boolean
  task: TaskInfo | null
  worktreePath?: string
  branchName?: string
}

function TaskCleanupTarget(props: TaskCleanupTargetProps): JSX.Element {
  const s = props.controller
  const visibleRows = createMemo(() =>
    rows.filter((row) => {
      const item = s.items()[row.key]
      return !props.hideAbsent || item.state !== 'disabled'
    }),
  )
  return (
    <div data-testid="task-cleanup-target" data-worktree-path={props.worktreePath}>
      <For
        each={[
          {
            label: 'Worktree',
            keys: ['stopHerdrAgent', 'deleteWorktree'],
            name: () => props.worktreePath,
          },
          {
            label: 'Local branch',
            keys: ['deleteLocalBranch'],
            name: () => props.branchName,
          },
          {
            label: 'Remote branch',
            keys: ['deleteRemoteBranch'],
            name: () => props.branchName,
          },
        ]}
      >
        {(section) => (
          <div
            class="task-cleanup-reveal"
            data-visible={String(visibleRows().some((row) => section.keys.includes(row.key)))}
            inert={!visibleRows().some((row) => section.keys.includes(row.key))}
          >
            <div class="pb-3">
              <section
                aria-label={`${section.label}${section.name() ? `: ${section.name()}` : ''}`}
                class="rounded-md border border-border px-3 pt-3"
              >
                <div class="flex items-baseline gap-3">
                  <h3 class="shrink-0 text-sm font-medium">{section.label}</h3>
                  <Show when={section.name()}>
                    {(name) => <p class="min-w-0 break-all font-mono text-xs text-muted-foreground">{name()}</p>}
                  </Show>
                </div>
                <div class="divide-y divide-border text-left text-sm">
                  <For each={rows.filter((row) => section.keys.includes(row.key))}>
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
                      const disabledItem = () => {
                        const value = item()
                        return value.state === 'disabled' ? value : undefined
                      }
                      return (
                        <div
                          class="task-cleanup-reveal"
                          data-visible={String(visibleRows().includes(row))}
                          inert={!visibleRows().includes(row)}
                        >
                          <div class="grid grid-cols-[13rem_minmax(0,1fr)] items-start">
                            <div class="py-3 pr-2">
                              <Show when={blockedItem()}>
                                {(blocked) => (
                                  <>
                                    <Show when={blocked().killable}>
                                      <button
                                        type="button"
                                        onClick={() => void s.openKillDialog()}
                                        disabled={props.busy}
                                        class="btn-destructive mb-2 h-auto! min-h-10 w-full whitespace-normal break-words"
                                        data-testid="task-cleanup-kill-processes"
                                      >
                                        Kill processes
                                      </button>
                                    </Show>
                                    <Show when={blocked().forceDeleteable}>
                                      <button
                                        type="button"
                                        onClick={() => s.openForceDeleteDialog()}
                                        disabled={props.busy}
                                        class="btn-destructive mb-2 h-auto! min-h-10 w-full whitespace-normal break-words"
                                        data-testid="task-cleanup-force-delete-branch"
                                      >
                                        Force delete
                                      </button>
                                    </Show>
                                  </>
                                )}
                              </Show>
                              <button
                                type="button"
                                disabled={item().state !== 'ready' || props.busy}
                                onClick={() => s.requestConfirmation(row.key)}
                                class="btn-secondary h-auto! min-h-10 w-full whitespace-normal break-words"
                                data-testid={`${row.testId}-button`}
                              >
                                {row.label}
                              </button>
                            </div>
                            <div
                              class="py-3 pl-4"
                              data-testid={`${row.testId}-status`}
                              data-state={running() ? 'running' : item().state}
                              aria-live="polite"
                            >
                              <div class="min-w-0 whitespace-pre-line break-words text-left text-sm leading-5">
                                <Show
                                  when={running()}
                                  fallback={
                                    <>
                                      <Show when={item().state === 'checking'}>
                                        <span class="animate-pulse text-muted-foreground">Checking...</span>
                                      </Show>
                                      <Show when={blockedItem()}>
                                        {(blocked) => <span class="text-destructive">{blocked().reason}</span>}
                                      </Show>
                                      <Show when={disabledItem()}>
                                        {(disabled) => <span class="text-muted-foreground">{disabled().reason}</span>}
                                      </Show>
                                      <Show when={errorItem()}>{(error) => <FieldErrorMessage error={error().error} />}</Show>
                                    </>
                                  }
                                >
                                  <span class="animate-pulse text-muted-foreground">Working...</span>
                                </Show>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </section>
            </div>
          </div>
        )}
      </For>
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
                  {props.task?.number} - {props.task?.title}
                  <br />
                  <Show when={row()}>
                    <span class="break-all">
                      {operation() === 'deleteLocalBranch' || operation() === 'deleteRemoteBranch' ? props.branchName : props.worktreePath}
                    </span>
                    <br />
                  </Show>
                  {row()?.confirmation ??
                    (operation() === 'archive'
                      ? 'Move this task to the archive?'
                      : 'Permanently delete this task and its files? This cannot be undone.')}
                </DialogDescription>
                <div class="flex justify-end gap-2">
                  <button type="button" onClick={s.closeConfirmation} class="btn-secondary" data-testid="task-cleanup-confirm-cancel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={s.busy()}
                    onClick={() => void s.confirmOperation()}
                    class={operation() === 'archive' ? 'btn-primary' : 'btn-destructive'}
                    data-testid="task-cleanup-confirm"
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
    </div>
  )
}
