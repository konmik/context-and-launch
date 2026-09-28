import type { SourceAccessor } from 'solid-js'
import { createSignal, onSettled } from 'solid-js'
import type { Result } from '~/util/result.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import type { CleanupItemKey, TaskCleanupStatus } from '~/core/worktree/task-cleanup-checks.js'
import type { LockingProcessInfo } from '~/core/worktree/agent-worktree.js'
import {
  type TaskCleanupOptions,
  type TaskCleanupItemStates,
  singleCleanupOption,
  allChecking,
  allError,
} from './task-cleanup-pure.js'

export interface TaskCleanupDeps {
  onError: (error: ErrorInfo) => void
  projectSlug: () => string
  task: () => TaskInfo | null
  action: () => 'archive' | 'delete'
  loadStatus: (projectSlug: string, folderName: string) => Promise<TaskCleanupStatus>
  onCleanup: (folderName: string, cleanup: TaskCleanupOptions) => Promise<Result<undefined, ErrorInfo>>
  onSubmit: (folderName: string) => Promise<Result<undefined, ErrorInfo>>
  onOpenChange: (open: boolean) => void
  loadLockingProcesses: (projectSlug: string, folderName: string) => Promise<LockingProcessInfo[]>
  killLockingProcesses: (projectSlug: string, folderName: string, pids: number[]) => Promise<Result<undefined, ErrorInfo>>
  forceDeleteLocalBranch: (projectSlug: string, folderName: string) => Promise<Result<undefined, ErrorInfo>>
}

export type CleanupConfirmation = CleanupItemKey | 'archive' | 'delete'

export function createTaskCleanupController(deps: TaskCleanupDeps): TaskCleanupControllerResult {
  const [items, setItems] = createSignal<TaskCleanupItemStates>(allChecking())
  const [runningItem, setRunningItem] = createSignal<CleanupItemKey>()
  const [submitting, setSubmitting] = createSignal(false)
  const [killDialogOpen, setKillDialogOpen] = createSignal(false)
  const [lockingProcesses, setLockingProcesses] = createSignal<LockingProcessInfo[] | undefined>()
  const [killingProcesses, setKillingProcesses] = createSignal(false)
  const [forceDeleteDialogOpen, setForceDeleteDialogOpen] = createSignal(false)
  const [forceDeleting, setForceDeleting] = createSignal(false)
  const [confirmation, setConfirmation] = createSignal<CleanupConfirmation>()
  let requestToken = 0
  let lifecycleToken = 0

  function invalidateRequests(): void {
    lifecycleToken++
    requestToken++
  }

  onSettled(() => invalidateRequests)

  async function startChecks(): Promise<void> {
    const task = deps.task()
    if (!task) return
    const token = ++requestToken
    setItems(allChecking())
    try {
      const status = await deps.loadStatus(deps.projectSlug(), task.folderName)
      if (token === requestToken) {
        setItems(status)
      }
    } catch (err) {
      if (token === requestToken) {
        setItems(allError(errorPayload(err)))
      }
    }
  }

  async function runCleanup(key: CleanupItemKey): Promise<void> {
    const task = deps.task()
    if (!task || busy() || items()[key].state !== 'ready') return
    const token = lifecycleToken
    setRunningItem(key)
    try {
      const result = await deps.onCleanup(task.folderName, singleCleanupOption(key))
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (err) {
      deps.onError(errorPayload(err, 'Cleanup failed'))
    }
    if (token !== lifecycleToken) return
    await startChecks()
    if (token !== lifecycleToken) return
    setRunningItem(undefined)
  }

  const actionLabel = () => (deps.action() === 'archive' ? 'Archive' : 'Delete')
  const busy = () => submitting() || runningItem() !== undefined || killingProcesses() || forceDeleting()

  async function doSubmit() {
    const task = deps.task()
    if (!task || busy()) return
    const token = lifecycleToken
    setSubmitting(true)
    try {
      const result = await deps.onSubmit(task.folderName)
      if (token !== lifecycleToken) return
      if (result.type === 'Failure') deps.onError(result.error)
      else close()
    } catch (err) {
      deps.onError(errorPayload(err, 'Cleanup failed'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    requestConfirmation(deps.action())
  }

  function requestConfirmation(operation: CleanupConfirmation): void {
    if (!deps.task() || busy() || confirmation() || killDialogOpen() || forceDeleteDialogOpen()) return
    if (operation !== 'archive' && operation !== 'delete' && items()[operation].state !== 'ready') return
    setConfirmation(operation)
  }

  function closeConfirmation(): void {
    setConfirmation(undefined)
  }

  async function confirmOperation(): Promise<void> {
    const operation = confirmation()
    if (!operation || busy()) return
    closeConfirmation()
    if (operation === 'archive' || operation === 'delete') await doSubmit()
    else await runCleanup(operation)
  }

  async function openKillDialog(): Promise<void> {
    const task = deps.task()
    if (!task) return
    const token = lifecycleToken
    setKillDialogOpen(true)
    setLockingProcesses(undefined)
    try {
      const processes = await deps.loadLockingProcesses(deps.projectSlug(), task.folderName)
      if (token !== lifecycleToken) return
      setLockingProcesses(processes)
    } catch (err) {
      setLockingProcesses([])
      deps.onError(errorPayload(err, 'Could not list locking processes'))
    }
  }

  async function confirmKill(): Promise<void> {
    const task = deps.task()
    const processes = lockingProcesses()
    if (!task || !processes || processes.length === 0) return
    const token = lifecycleToken
    setKillingProcesses(true)
    try {
      const result = await deps.killLockingProcesses(
        deps.projectSlug(),
        task.folderName,
        processes.map((p) => p.pid),
      )
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (err) {
      deps.onError(errorPayload(err, 'Failed to kill processes'))
    }
    if (token !== lifecycleToken) return
    setKillingProcesses(false)
    closeKillDialog()
    await startChecks()
  }

  function openForceDeleteDialog(): void {
    setForceDeleteDialogOpen(true)
  }

  async function confirmForceDelete(): Promise<void> {
    const task = deps.task()
    if (!task) return
    const token = lifecycleToken
    setForceDeleting(true)
    try {
      const result = await deps.forceDeleteLocalBranch(deps.projectSlug(), task.folderName)
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (err) {
      deps.onError(errorPayload(err, 'Failed to force-delete branch'))
    }
    if (token !== lifecycleToken) return
    setForceDeleting(false)
    closeForceDeleteDialog()
    await startChecks()
  }

  function closeForceDeleteDialog(): void {
    setForceDeleteDialogOpen(false)
  }

  function closeKillDialog(): void {
    setKillDialogOpen(false)
    setLockingProcesses(undefined)
  }

  function close() {
    invalidateRequests()
    deps.onOpenChange(false)
    setItems(allChecking())
    setRunningItem(undefined)
    closeKillDialog()
    closeForceDeleteDialog()
    closeConfirmation()
  }

  return {
    items,
    runningItem,
    submitting,
    busy,
    actionLabel,
    startChecks,
    handleSubmit,
    confirmation,
    requestConfirmation,
    closeConfirmation,
    confirmOperation,
    close,
    killDialogOpen,
    lockingProcesses,
    killingProcesses,
    openKillDialog,
    confirmKill,
    closeKillDialog,
    forceDeleteDialogOpen,
    forceDeleting,
    openForceDeleteDialog,
    confirmForceDelete,
    closeForceDeleteDialog,
  }
}

export interface TaskCleanupControllerResult {
  items: SourceAccessor<TaskCleanupItemStates>
  runningItem: SourceAccessor<CleanupItemKey | undefined>
  submitting: SourceAccessor<boolean>
  busy: () => boolean
  actionLabel: () => 'Archive' | 'Delete'
  startChecks: () => Promise<void>
  handleSubmit: (e: SubmitEvent) => void
  confirmation: SourceAccessor<CleanupConfirmation | undefined>
  requestConfirmation: (operation: CleanupConfirmation) => void
  closeConfirmation: () => void
  confirmOperation: () => Promise<void>
  close: () => void
  killDialogOpen: SourceAccessor<boolean>
  lockingProcesses: SourceAccessor<LockingProcessInfo[] | undefined>
  killingProcesses: SourceAccessor<boolean>
  openKillDialog: () => Promise<void>
  confirmKill: () => Promise<void>
  closeKillDialog: () => void
  forceDeleteDialogOpen: SourceAccessor<boolean>
  forceDeleting: SourceAccessor<boolean>
  openForceDeleteDialog: () => void
  confirmForceDelete: () => Promise<void>
  closeForceDeleteDialog: () => void
}
