import type { Setter } from 'solid-js'
import { createSignal, flush } from 'solid-js'
import { revalidate, useAction } from '@solidjs/router'
import type { TaskInfo } from '~/core/task/task-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import { createTask, deleteTask, archiveTask, syncTasks, worktreeCleanup } from '../task/task-api.js'
import { deleteProject, getSyncStatus, type DeleteProjectResult } from './project-api.js'
import { taskMutationRevalidateKeys, projectSyncRevalidateKeys } from '../shared/revalidate-keys.js'
import type { ProjectPageData } from './project-api.js'
import { resolveConflicts, abortRebase } from '../launcher/launcher-api.js'
import { parseSyncResult } from './project-page-pure.js'
import type { TaskCleanupOptions } from '../shared/task-cleanup-pure.js'
import { onSuccess, type Result } from '~/util/result.js'

export interface ProjectPageDeps {
  onError: (error: ErrorInfo) => void
  projectSlug: () => string
  data: () => ProjectPageData | undefined
  runSyncTasks?: (projectSlug: string) => ReturnType<typeof syncTasks>
  runDeleteProject?: (projectSlug: string) => Promise<Result<DeleteProjectResult, ErrorInfo>>
}

export function createProjectPageController(deps: ProjectPageDeps): ProjectPageControllerResult {
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [createTaskOpen, setCreateTaskOpen] = createSignal(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false)
  const [cleanupAction, setCleanupAction] = createSignal<'archive' | 'delete'>('archive')
  const [selectedTaskFolderName, setSelectedTaskFolderName] = createSignal<string>()
  const selectedTask = (): TaskInfo | null => {
    const data = deps.data()
    return data?.status === 'loaded' ? (data.board.tasks.find((task) => task.folderName === selectedTaskFolderName()) ?? null) : null
  }
  const [detailTask, setDetailTask] = createSignal<TaskInfo | null>(null)
  const [reviewTask, setReviewTask] = createSignal<TaskInfo | null>(null)
  const [syncing, setSyncing] = createSignal(false)
  const [syncSuccess, setSyncSuccess] = createSignal(false)
  const [conflictDialogOpen, setConflictDialogOpen] = createSignal(false)
  const [conflictDetected, setConflictDetected] = createSignal(false)
  const runSyncTasks = deps.runSyncTasks ?? useAction(syncTasks)
  const runDeleteProject = deps.runDeleteProject ?? useAction(deleteProject)
  let syncInProgress = false

  async function handleSync() {
    if (syncInProgress) return
    const d = deps.data()
    if (!d || d.status !== 'loaded') return
    syncInProgress = true // Paint the imperative sync lock before starting filesystem and network work.
    flush(() => {
      setSyncing(true)
    })
    let showSuccess = false
    try {
      const ss = await getSyncStatus(deps.projectSlug())
      if (ss.hasConflict) {
        setConflictDetected(true)
        await revalidate(projectSyncRevalidateKeys)
        setConflictDialogOpen(true)
        return
      }
      setConflictDetected(false)
      if (!ss.hasRemote) {
        deps.onError({
          title: 'Sync failed',
          description: 'No remote tracking branch configured.' + ' Push the task branch to a remote first.',
        })
        return
      }
      const result = await runSyncTasks(deps.projectSlug())
      if (result.type === 'Failure') {
        deps.onError(result.error)
      } else {
        const parsed = parseSyncResult(result.value)
        if (parsed.type === 'Failure') {
          deps.onError(parsed.error)
        } else if (parsed.value.type === 'success') {
          showSuccess = true
          setSyncSuccess(true)
          setTimeout(() => {
            setSyncSuccess(false)
            setSyncing(false)
            syncInProgress = false
          }, 2000)
          await revalidate(projectSyncRevalidateKeys)
        } else {
          await revalidate(projectSyncRevalidateKeys)
          setConflictDialogOpen(true)
        }
      }
    } catch (err) {
      deps.onError(errorPayload(err, 'Sync failed'))
    } finally {
      if (!showSuccess) {
        setSyncing(false)
        syncInProgress = false
      }
    }
  }

  async function handleConflictResolve(profileName: string) {
    const result = await resolveConflicts(deps.projectSlug(), profileName)
    if (result.type === 'Failure') throw result.error
    await revalidate(projectSyncRevalidateKeys)
  }

  async function handleConflictAbort() {
    const result = await abortRebase(deps.projectSlug())
    if (result.type === 'Failure') throw result.error
    setConflictDetected(false)
    await revalidate(projectSyncRevalidateKeys)
  }

  function openDelete(task: TaskInfo) {
    setDetailTask(null)
    setSelectedTaskFolderName(task.folderName)
    setCleanupAction('delete')
    setCleanupDialogOpen(true)
  }

  function openArchive(task: TaskInfo) {
    setDetailTask(null)
    setSelectedTaskFolderName(task.folderName)
    setCleanupAction('archive')
    setCleanupDialogOpen(true)
  }

  function openDetail(task: TaskInfo) {
    setDetailTask(task)
  }

  function openReview(task: TaskInfo) {
    if (!task.hasAgentWorktree) return
    if (detailTask()) setDetailTask(null)
    setReviewTask(task) // Opening Diff Review replaces the board that owns this event handler.
    // Commit the selection before that dynamic subtree is disposed.
    flush()
  }

  async function handleCreateTask(number: string, title: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await createTask(deps.projectSlug(), number, title)
    onSuccess(result, () => revalidate(taskMutationRevalidateKeys))
    return result
  }

  async function handleArchiveTask(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await archiveTask(deps.projectSlug(), folderName)
    onSuccess(result, () => revalidate(taskMutationRevalidateKeys))
    return result
  }

  async function handleDeleteTask(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await deleteTask(deps.projectSlug(), folderName)
    onSuccess(result, () => revalidate(taskMutationRevalidateKeys))
    return result
  }

  async function handleDeleteProject(projectSlug: string): Promise<Result<DeleteProjectResult, ErrorInfo>> {
    return runDeleteProject(projectSlug)
  }

  async function handleCleanupSubmit(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    return cleanupAction() === 'archive' ? await handleArchiveTask(folderName) : await handleDeleteTask(folderName)
  }

  async function handleCleanupAction(folderName: string, options: TaskCleanupOptions): Promise<Result<undefined, ErrorInfo>> {
    const cleanupResult = await worktreeCleanup(deps.projectSlug(), folderName, options)
    await revalidate(taskMutationRevalidateKeys)
    return cleanupResult
  }

  const dialogState = () => ({
    createTaskOpen: createTaskOpen(),
    cleanupDialogOpen: cleanupDialogOpen(),
    cleanupAction: cleanupAction(),
    settingsOpen: settingsOpen(),
    addProjectDialogOpen: addProjectDialogOpen(),
    conflictDialogOpen: conflictDialogOpen(),
  })
  const syncState = () => ({
    syncing: syncing(),
    syncSuccess: syncSuccess(),
    conflictDetected: conflictDetected(),
  })
  const selectionState = () => {
    return {
      selectedTask: selectedTask(),
      detailTask: detailTask(),
      reviewTask: reviewTask(),
    }
  }
  const commands = {
    openCreate: () => setCreateTaskOpen(true),
    openDelete,
    openArchive,
    openDetail,
    openReview,
    // Callers navigate immediately after these commands and need overlays disposed first.
    closeReview: () => setReviewTask(null),
    closeDetail: () => setDetailTask(null),
    handleSync,
    handleConflictResolve,
    handleConflictAbort,
    handleCreateTask,
    handleCleanupAction,
    handleCleanupSubmit,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    openAddProject: () => setAddProjectDialogOpen(true),
    closeAddProject: () => setAddProjectDialogOpen(false),
    handleDeleteProject,
    setCreateTaskOpen,
    setCleanupDialogOpen,
    setConflictDialogOpen,
  }
  return {
    dialogState,
    syncState,
    selectionState,
    commands,
  }
}

export type ProjectPageController = ReturnType<typeof createProjectPageController>

export interface ProjectPageControllerResult {
  dialogState: () => {
    createTaskOpen: boolean
    cleanupDialogOpen: boolean
    cleanupAction: 'archive' | 'delete'
    settingsOpen: boolean
    addProjectDialogOpen: boolean
    conflictDialogOpen: boolean
  }
  syncState: () => {
    syncing: boolean
    syncSuccess: boolean
    conflictDetected: boolean
  }
  selectionState: () => {
    selectedTask: TaskInfo | null
    detailTask: TaskInfo | null
    reviewTask: TaskInfo | null
  }
  commands: {
    openCreate: () => true
    openDelete: (task: TaskInfo) => void
    openArchive: (task: TaskInfo) => void
    openDetail: (task: TaskInfo) => void
    openReview: (task: TaskInfo) => void
    closeReview: () => null
    closeDetail: () => null
    handleSync: () => Promise<void>
    handleConflictResolve: (profileName: string) => Promise<void>
    handleConflictAbort: () => Promise<void>
    handleCreateTask: (number: string, title: string) => Promise<Result<undefined, ErrorInfo>>
    handleCleanupAction: (folderName: string, options: TaskCleanupOptions) => Promise<Result<undefined, ErrorInfo>>
    handleCleanupSubmit: (folderName: string) => Promise<Result<undefined, ErrorInfo>>
    openSettings: () => true
    closeSettings: () => false
    openAddProject: () => true
    closeAddProject: () => false
    handleDeleteProject: (projectSlug: string) => Promise<Result<DeleteProjectResult, ErrorInfo>>
    setCreateTaskOpen: Setter<boolean>
    setCleanupDialogOpen: Setter<boolean>
    setConflictDialogOpen: Setter<boolean>
  }
}
