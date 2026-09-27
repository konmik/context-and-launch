import type { Setter } from 'solid-js'
import { createSignal, flush } from 'solid-js'
import { revalidate, useAction } from '@solidjs/router'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import { createErrorState } from '~/util/error-state.js'
import { createTicket, deleteTicket, archiveTicket, syncTickets, worktreeCleanup } from '../ticket/ticket-api.js'
import { deleteProject, getSyncStatus } from './project-api.js'
import { ticketMutationRevalidateKeys, projectSyncRevalidateKeys } from '../shared/revalidate-keys.js'
import type { ProjectPageData } from './project-api.js'
import { resolveConflicts, abortRebase } from '../launcher/launcher-api.js'
import { parseSyncResult } from './project-page-pure.js'
import type { TicketCleanupOptions } from '../shared/ticket-cleanup-pure.js'
import { onSuccess, type Result } from '~/util/result.js'

export interface ProjectPageDeps {
  onError?: (error: ErrorInfo) => void
  projectSlug: () => string
  data: () => ProjectPageData | undefined
  runSyncTickets?: (projectSlug: string) => ReturnType<typeof syncTickets>
}

export function createProjectPageController(deps: ProjectPageDeps): ProjectPageControllerResult {
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [createTicketOpen, setCreateTicketOpen] = createSignal(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false)
  const [cleanupAction, setCleanupAction] = createSignal<'archive' | 'delete'>('archive')
  const [selectedTicket, setSelectedTicket] = createSignal<TicketInfo | null>(null)
  const [detailTicket, setDetailTicket] = createSignal<TicketInfo | null>(null)
  const [reviewTicket, setReviewTicket] = createSignal<TicketInfo | null>(null)
  const [syncing, setSyncing] = createSignal(false)
  const [syncSuccess, setSyncSuccess] = createSignal(false)
  const { error: syncError, setError: setSyncError } = createErrorState(deps.onError)
  const [conflictDialogOpen, setConflictDialogOpen] = createSignal(false)
  const [conflictDetected, setConflictDetected] = createSignal(false)
  const runSyncTickets = deps.runSyncTickets ?? useAction(syncTickets)
  let syncInProgress = false

  async function handleSync() {
    if (syncInProgress) return
    const d = deps.data()
    if (!d || d.status !== 'loaded') return
    syncInProgress = true // Paint the imperative sync lock before starting filesystem and network work.
    flush(() => {
      setSyncing(true)
      setSyncError(null)
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
        setSyncError({
          title: 'Sync failed',
          description: 'No remote tracking branch configured.' + ' Push the ticket branch to a remote first.',
        })
        return
      }
      const result = await runSyncTickets(deps.projectSlug())
      if (result.type === 'Failure') {
        setSyncError(result.error)
      } else {
        const parsed = parseSyncResult(result.value)
        if (parsed.type === 'Failure') {
          setSyncError(parsed.error)
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
      setSyncError(errorPayload(err, 'Sync failed'))
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

  function openDelete(ticket: TicketInfo) {
    setSelectedTicket(ticket)
    setCleanupAction('delete')
    setCleanupDialogOpen(true)
  }

  function openArchive(ticket: TicketInfo) {
    setSelectedTicket(ticket)
    setCleanupAction('archive')
    setCleanupDialogOpen(true)
  }

  function openDetail(ticket: TicketInfo) {
    setDetailTicket(ticket)
  }

  function openReview(ticket: TicketInfo) {
    if (!ticket.hasAgentWorktree) return
    if (detailTicket()) setDetailTicket(null)
    setReviewTicket(ticket) // Opening Diff Review replaces the board that owns this event handler.
    // Commit the selection before that dynamic subtree is disposed.
    flush()
  }

  async function handleCreateTicket(number: string, title: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await createTicket(deps.projectSlug(), number, title)
    onSuccess(result, () => revalidate(ticketMutationRevalidateKeys))
    return result
  }

  async function handleArchiveTicket(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await archiveTicket(deps.projectSlug(), folderName)
    onSuccess(result, () => revalidate(ticketMutationRevalidateKeys))
    return result
  }

  async function handleDeleteTicket(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await deleteTicket(deps.projectSlug(), folderName)
    onSuccess(result, () => revalidate(ticketMutationRevalidateKeys))
    return result
  }

  async function handleDeleteProject(projectSlug: string): Promise<Result<undefined, ErrorInfo>> {
    const result = await deleteProject(projectSlug)
    onSuccess(result, () => revalidate('project-page'))
    return result
  }

  async function handleCleanupSubmit(folderName: string): Promise<Result<undefined, ErrorInfo>> {
    return cleanupAction() === 'archive' ? await handleArchiveTicket(folderName) : await handleDeleteTicket(folderName)
  }

  async function handleCleanupAction(folderName: string, options: TicketCleanupOptions): Promise<Result<undefined, ErrorInfo>> {
    const cleanupResult = await worktreeCleanup(deps.projectSlug(), folderName, options)
    return cleanupResult
  }

  const dialogState = () => ({
    createTicketOpen: createTicketOpen(),
    cleanupDialogOpen: cleanupDialogOpen(),
    cleanupAction: cleanupAction(),
    settingsOpen: settingsOpen(),
    addProjectDialogOpen: addProjectDialogOpen(),
    conflictDialogOpen: conflictDialogOpen(),
  })
  const syncState = () => ({
    syncing: syncing(),
    syncSuccess: syncSuccess(),
    syncError: syncError(),
    conflictDetected: conflictDetected(),
  })
  const selectionState = () => {
    return {
      selectedTicket: selectedTicket(),
      detailTicket: detailTicket(),
      reviewTicket: reviewTicket(),
    }
  }
  const commands = {
    openCreate: () => setCreateTicketOpen(true),
    openDelete,
    openArchive,
    openDetail,
    openReview,
    // Callers navigate immediately after these commands and need overlays disposed first.
    closeReview: () => setReviewTicket(null),
    closeDetail: () => setDetailTicket(null),
    handleSync,
    handleConflictResolve,
    handleConflictAbort,
    handleCreateTicket,
    handleCleanupAction,
    handleCleanupSubmit,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    openAddProject: () => setAddProjectDialogOpen(true),
    closeAddProject: () => setAddProjectDialogOpen(false),
    handleDeleteProject,
    setCreateTicketOpen,
    setCleanupDialogOpen,
    setConflictDialogOpen,
    setSyncError,
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
    createTicketOpen: boolean
    cleanupDialogOpen: boolean
    cleanupAction: 'archive' | 'delete'
    settingsOpen: boolean
    addProjectDialogOpen: boolean
    conflictDialogOpen: boolean
  }
  syncState: () => {
    syncing: boolean
    syncSuccess: boolean
    syncError: ErrorInfo | undefined
    conflictDetected: boolean
  }
  selectionState: () => {
    selectedTicket: TicketInfo | null
    detailTicket: TicketInfo | null
    reviewTicket: TicketInfo | null
  }
  commands: {
    openCreate: () => true
    openDelete: (ticket: TicketInfo) => void
    openArchive: (ticket: TicketInfo) => void
    openDetail: (ticket: TicketInfo) => void
    openReview: (ticket: TicketInfo) => void
    closeReview: () => null
    closeDetail: () => null
    handleSync: () => Promise<void>
    handleConflictResolve: (profileName: string) => Promise<void>
    handleConflictAbort: () => Promise<void>
    handleCreateTicket: (number: string, title: string) => Promise<Result<undefined, ErrorInfo>>
    handleCleanupAction: (folderName: string, options: TicketCleanupOptions) => Promise<Result<undefined, ErrorInfo>>
    handleCleanupSubmit: (folderName: string) => Promise<Result<undefined, ErrorInfo>>
    openSettings: () => true
    closeSettings: () => false
    openAddProject: () => true
    closeAddProject: () => false
    handleDeleteProject: (projectSlug: string) => Promise<Result<undefined, ErrorInfo>>
    setCreateTicketOpen: Setter<boolean>
    setCleanupDialogOpen: Setter<boolean>
    setConflictDialogOpen: Setter<boolean>
    setSyncError: (error?: ErrorInfo | null) => void
  }
}
