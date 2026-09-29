import type { GroupTicketResult } from '../forest/forest-api.js'
import type { ActionError } from '../../core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { Result } from '../../util/result.js'
import type { ResponseEnvelope } from '@solidjs/web'
import type { ProjectInfo } from '../../core/project/project-registry.js'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { action, query } from '@solidjs/router'
import { respond } from '@solidjs/web'
import {
  worktreeManager,
  boardConfigManager,
  projectRegistry,
  operationTracker,
  ticketSyncManager,
  syncPendingTracker,
  worktreeRevisions,
  launcherConfigManager,
  agentWorktreeManager,
  fileWatcher,
  herdrExec,
  commandTemplateService,
  diffReviewStore,
} from '~/core/config/instances.js'
import { openInOs } from '~/core/infra/open-in-os.js'
import { appLog } from '~/core/infra/app-logger.js'
import { createTicketStore, type TicketStore, type TicketInfo } from '~/core/ticket/ticket-store.js'
import { ticketAgentWorktrees, ticketAgentKey } from '~/core/ticket/ticket-worktrees.js'
import type { StatusJson } from '~/core/ticket/ticket-repository.js'
import type { TicketOrder } from '~/core/ticket/ticket-order-data.js'
import { failure, success } from '~/util/result.js'
import { extractPrefixFromInput } from '~/core/ticket/ticket-number.js'
import { cleanupWorktree } from '~/core/worktree/worktree-cleanup.js'
import { resolveAgentWorktreeLocation, worktreeInstanceName } from '~/core/worktree/worktree-naming.js'
import { runTicketCleanupChecks } from '~/core/worktree/ticket-cleanup-checks.js'
import type { TicketCleanupStatus, TicketCleanupOptions } from '~/core/worktree/ticket-cleanup-checks.js'
import { findHerdrAgent, stopHerdrAgent } from '~/core/herdr/herdr-control.js'
import { createValidationError, createNotFoundError, errorPayload, errorResult } from '~/core/shared/errors.js'
import { resolveInitialTicketStatus } from '~/core/board/initial-ticket-status.js'
import type { LockingProcessInfo } from '~/core/worktree/agent-worktree.js'
import { diffReviewWorktreeIdentity } from '~/core/diff-review/diff-review-target.js'

function mutateTickets<T>(projectSlug: string, mutation: (store: TicketStore) => T): T {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return mutation(createTicketStore(worktreeDir))
  } finally {
    worktreeRevisions.bump(worktreeDir)
  }
}

async function mutateTicketsExclusive<T>(projectSlug: string, mutation: (store: TicketStore) => T): Promise<T> {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return await fileWatcher.runWithWatchPaused(worktreeDir, () => mutation(createTicketStore(worktreeDir)))
  } finally {
    worktreeRevisions.bump(worktreeDir)
  }
}

export async function createTicket(projectSlug: string, number: string, title: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const initialStatus = resolveInitialTicketStatus(projectSlug, {
      projectRegistry,
      boardConfigManager,
    })
    mutateTickets(projectSlug, (store) => store.createTicket(number, title, initialStatus))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function updateTicket(
  projectSlug: string,
  folderName: string,
  number: string | null,
  title: string | null,
  status: string | null,
): Promise<Result<GroupTicketResult, ActionError>> {
  'use server'

  try {
    const updated = await mutateTicketsExclusive(projectSlug, (store) => store.updateTicket(folderName, number, title, status))
    return success({
      folderName: updated.folderName,
    })
  } catch (e) {
    return errorResult(e)
  }
}

export async function deleteTicket(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    await mutateTicketsExclusive(projectSlug, (store) => store.deleteTicket(folderName))
    await diffReviewStore.removeTicket(projectSlug, folderName)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function archiveTicket(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    await mutateTicketsExclusive(projectSlug, (store) => store.archiveTicket(folderName))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function readTicketOrder(projectSlug: string): Promise<Result<TicketOrder, UserFacingError>> {
  'use server'

  try {
    return success(createTicketStore(worktreeManager.getWorktreeDir(projectSlug)).orderStore.read())
  } catch (error) {
    return failure(errorPayload(error, 'Load ticket order failed'))
  }
}

export async function saveTicketOrder(
  projectSlug: string,
  expected: TicketOrder,
  order: TicketOrder,
): Promise<Result<TicketOrder, UserFacingError>> {
  'use server'

  try {
    return success(
      mutateTickets(projectSlug, (store) => {
        store.orderStore.write(order, expected)
        return order
      }),
    )
  } catch (error) {
    return failure(errorPayload(error, 'Save ticket order failed'))
  }
}

function withAgentWorktreeStatus(projectSlug: string, ticket: TicketInfo): TicketInfo {
  const { worktreePath } = resolveAgentWorktreeLocation(ticket.folderName, launcherConfigManager.resolveWorktreeSettings(projectSlug), {
    savedWorktreePath: ticket.agentWorktreeDir,
  })
  return {
    ...ticket,
    hasAgentWorktree: fs.existsSync(worktreePath),
  }
}

export const getTicket = query(async (projectSlug: string, folderName: string): Promise<TicketInfo> => {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const ticket = createTicketStore(worktreeDir).getTicket(folderName)
  if (!ticket) throw createNotFoundError(`Ticket not found: ${folderName}`)
  return withAgentWorktreeStatus(projectSlug, ticket)
}, 'ticket-detail')

export async function getContext(projectSlug: string, folderName: string, contextFileName: string): Promise<ContextResult | null> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = createTicketStore(worktreeDir)
  const content = store.getTicketContext(folderName, contextFileName)
  if (content === null) return null
  return {
    content,
  }
}

export async function saveContext(
  projectSlug: string,
  folderName: string,
  contextFileName: string,
  content: string,
): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    mutateTickets(projectSlug, (store) => store.saveTicketContext(folderName, contextFileName, content))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function deleteContext(
  projectSlug: string,
  folderName: string,
  contextFileName: string,
): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    mutateTickets(projectSlug, (store) => store.deleteTicketContext(folderName, contextFileName))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function deleteFile(projectSlug: string, folderName: string, fileName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    mutateTickets(projectSlug, (store) => store.deleteTicketFile(folderName, fileName))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function uploadFile(
  projectSlug: string,
  folderName: string,
  formData: FormData,
): Promise<Result<UploadFileResult, ActionError>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    try {
      const store = createTicketStore(worktreeDir)
      const results: Result<UploadedFile, FileUploadError>[] = []
      for (const [, value] of formData.entries()) {
        if (!(value instanceof File)) continue
        const fileName = value.name
        try {
          const arrayBuffer = await value.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          store.copyFileToTicket(folderName, fileName, buffer)
          results.push(
            success({
              name: fileName,
            }),
          )
        } catch (e) {
          results.push(
            failure({
              name: fileName,
              ...errorPayload(e, 'Upload failed'),
            }),
          )
        }
      }
      return success({
        results,
      })
    } finally {
      worktreeRevisions.bump(worktreeDir)
    }
  } catch (e) {
    return errorResult(e)
  }
}

export const saveTicketStatus = action(async (projectSlug: string, previousJson: string, nextJson: string) => {
  'use server'

  try {
    const previous: TicketInfo = JSON.parse(previousJson)
    const next: TicketInfo = JSON.parse(nextJson)
    const updated = await mutateTicketsExclusive(projectSlug, (store) => {
      const details: Partial<Pick<StatusJson, 'useWorktree' | 'references'>> = {}
      if (next.useWorktree !== previous.useWorktree) details.useWorktree = next.useWorktree
      const removed = previous.references.filter((ref) => !next.references.some((nextRef) => nextRef.path === ref.path))
      const added = next.references.filter((ref) => !previous.references.some((previousRef) => previousRef.path === ref.path))
      const current = store.getTicket(previous.folderName)
      if (!current) throw createNotFoundError(`Ticket not found: ${previous.folderName}`)
      if (
        !removed.length &&
        !added.length &&
        next.useWorktree === previous.useWorktree &&
        next.number === previous.number &&
        next.title === previous.title &&
        next.status === previous.status
      ) {
        return current
      }
      if (removed.length || added.length) {
        details.references = [
          ...new Set(
            [...current.references.filter((ref) => !removed.some((removedRef) => removedRef.path === ref.path)), ...added].map(
              (reference) => reference.path,
            ),
          ),
        ].map((path) => ({
          path,
        }))
      }
      return store.updateTicket(
        previous.folderName,
        next.number !== previous.number ? next.number : undefined,
        next.title !== previous.title ? next.title : undefined,
        next.status !== previous.status ? next.status : undefined,
        details,
      )
    })
    return respond(success(withAgentWorktreeStatus(projectSlug, updated)), {
      revalidate: [],
    })
  } catch (error) {
    return respond(failure(errorPayload(error, 'Save ticket failed')), {
      revalidate: [],
    })
  }
}, 'save-ticket-status')

export const addTicketWorktree = action(
  async (projectSlug: string, folderName: string): Promise<ResponseEnvelope<Result<undefined, UserFacingError>>> => {
    'use server'

    try {
      const project = projectRegistry.listProjects().find((entry) => entry.projectSlug === projectSlug)
      if (!project) throw createNotFoundError('Project not found')
      const store = createTicketStore(worktreeManager.getWorktreeDir(projectSlug))
      const ticket = store.getTicket(folderName)
      if (!ticket) throw createNotFoundError('Ticket not found')
      if (ticketAgentWorktrees(ticket).length === 0) {
        const legacy = resolveAgentWorktreeLocation(folderName, launcherConfigManager.resolveWorktreeSettings(projectSlug))
        if (agentWorktreeManager.isGitWorktree(legacy.worktreePath)) {
          const ownership = await agentWorktreeManager.getWorktreeOwnership(project.path, legacy.worktreePath)
          if (ownership.kind !== 'current-project') throw createValidationError('The existing ticket worktree belongs to another project.')
          mutateTickets(projectSlug, (currentStore) =>
            currentStore.saveAgentWorktreeInfo(folderName, legacy.branchName, legacy.worktreePath),
          )
        }
      }
      const instanceId = randomUUID().replaceAll('-', '').slice(0, 12)
      const worktreeName = worktreeInstanceName(folderName, instanceId)
      const result = await agentWorktreeManager.ensureAgentWorktree(
        project.path,
        projectSlug,
        worktreeName,
        {
          requireNew: true,
        },
        project.mainBranch,
      )
      if (result.type === 'Failure') {
        throw createValidationError('Main branch has uncommitted changes. Commit or stash them before adding a worktree.')
      }
      mutateTickets(projectSlug, (currentStore) => {
        currentStore.saveAgentWorktreeInfo(
          folderName,
          result.value.branchName,
          result.value.worktreePath,
          `${folderName}--worktree-${instanceId}`,
        )
        currentStore.selectAgentWorktree(folderName, result.value.worktreePath)
      })
      return respond(success(undefined), {
        revalidate: [getTicket.keyFor(projectSlug, folderName)],
      })
    } catch (error) {
      return respond(failure(errorPayload(error, 'Add worktree failed')), {
        revalidate: [],
      })
    }
  },
  'add-ticket-worktree',
)

export const selectTicketWorktree = action(
  async (
    projectSlug: string,
    folderName: string,
    worktreePath: string | null,
  ): Promise<ResponseEnvelope<Result<undefined, UserFacingError>>> => {
    'use server'

    try {
      mutateTickets(projectSlug, (store) => store.selectAgentWorktree(folderName, worktreePath ?? undefined))
      return respond(success(undefined), {
        revalidate: [getTicket.keyFor(projectSlug, folderName)],
      })
    } catch (error) {
      return respond(failure(errorPayload(error, 'Select worktree failed')), {
        revalidate: [],
      })
    }
  },
  'select-ticket-worktree',
)

export const syncTickets = action(async function syncTickets(
  projectSlug: string,
): Promise<ResponseEnvelope<Result<SuccessSyncTicketsResult | ConflictSyncTicketsResult, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    const result = await fileWatcher.runWithWatchPaused(worktreeDir, async () => {
      const result = await operationTracker.track(ticketSyncManager.sync(worktreeDir))
      worktreeRevisions.bump(worktreeDir)
      return result.type === 'Failure' ? errorResult(result.error) : result
    })
    return respond(result, {
      revalidate: [],
    })
  } catch (e) {
    return respond(errorResult(e), {
      revalidate: [],
    })
  }
}, 'sync-tickets')

export const getWorktreeRevision = query(async (projectSlug: string): Promise<number> => {
  'use server'

  return worktreeRevisions.current(worktreeManager.getWorktreeDir(projectSlug))
}, 'worktree-revision')

export const getSyncPending = query(async (projectSlug: string): Promise<boolean> => {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  return syncPendingTracker.hasPendingChanges(worktreeDir)
}, 'sync-pending')

export async function suggestTicketNumber(projectSlug: string, numberInput: string): Promise<string | null> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = createTicketStore(worktreeDir)
  const prefix = extractPrefixFromInput(numberInput)
  return store.suggestNextNumber(prefix)
}

function resolveTicketWorktreeTarget(projectSlug: string, folderName: string, selectedWorktreePath?: string): TicketWorktreeTarget {
  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
  if (!project) throw createNotFoundError('Project not found')
  const store = createTicketStore(worktreeManager.getWorktreeDir(projectSlug))
  const ticket = store.getTicket(folderName)
  const selected = ticket && ticketAgentWorktrees(ticket).find((entry) => entry.worktreePath === selectedWorktreePath)
  if (selectedWorktreePath && !selected) throw createValidationError('The selected worktree does not belong to this ticket.')
  const { worktreePath, branchName } = resolveAgentWorktreeLocation(
    folderName,
    launcherConfigManager.resolveWorktreeSettings(projectSlug),
    {
      savedWorktreePath: selected?.worktreePath ?? ticket?.agentWorktreeDir,
      savedBranchName: selected?.branchName ?? ticket?.agentWorktreeBranchName,
    },
  )
  return {
    project,
    ticket,
    worktreePath,
    branchName,
  }
}

export async function openTicketWorktree(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const { worktreePath } = resolveTicketWorktreeTarget(projectSlug, folderName)
    if (!fs.existsSync(worktreePath)) {
      throw createNotFoundError(`Worktree does not exist: ${worktreePath}`)
    }
    await openInOs(worktreePath, commandTemplateService)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function openTicketFolder(projectSlug: string, folderName: string): Promise<Result<void, UserFacingError>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    const store = createTicketStore(worktreeDir)
    if (!store.getTicket(folderName)) throw createNotFoundError(`Ticket not found: ${folderName}`)
    await openInOs(path.join(worktreeDir, folderName), commandTemplateService)
    return success(undefined)
  } catch (error) {
    return failure(errorPayload(error, 'Open ticket folder failed'))
  }
}

export async function getCleanupStatus(
  projectSlug: string,
  folderName: string,
  selectedWorktreePath: string | null = null,
): Promise<TicketCleanupStatus> {
  'use server'

  appLog('ticket-cleanup', 'Checking cleanup status', {
    projectSlug,
    folderName,
    selectedWorktreePath: selectedWorktreePath ?? undefined,
  })
  const { project, ticket, worktreePath, branchName } = resolveTicketWorktreeTarget(
    projectSlug,
    folderName,
    selectedWorktreePath ?? undefined,
  )
  appLog('ticket-cleanup', 'Resolved cleanup target', {
    projectSlug,
    folderName,
    worktreePath,
    branchName,
  })
  return runTicketCleanupChecks(
    {
      projectSlug,
      folderName: ticket ? ticketAgentKey(folderName, ticket, worktreePath) : folderName,
      projectPath: project.path,
      worktreePath,
      branchName,
      configuredMainBranch: project.mainBranch,
    },
    {
      worktreeExists: (worktreePath) => fs.existsSync(worktreePath),
      isGitWorktree: (worktreePath) => agentWorktreeManager.isGitWorktree(worktreePath),
      getWorktreeOwnership: (projectPath, worktreePath) => agentWorktreeManager.getWorktreeOwnership(projectPath, worktreePath),
      isWorktreeClean: (worktreePath) => agentWorktreeManager.isWorktreeClean(worktreePath),
      isWorktreeBusy: (worktreePath) => agentWorktreeManager.isWorktreeBusy(worktreePath),
      localBranchExists: (projectPath, branchName) => agentWorktreeManager.localBranchExists(projectPath, branchName),
      worktreePathForBranch: (projectPath, branchName) => agentWorktreeManager.worktreePathForBranch(projectPath, branchName),
      isBranchMerged: (projectPath, branchName, mainBranch) => agentWorktreeManager.isBranchMerged(projectPath, branchName, mainBranch),
      hasRemoteBranch: (projectPath, branchName) => agentWorktreeManager.hasRemoteBranch(projectPath, branchName),
      findHerdrAgent: (target) => findHerdrAgent(target, herdrExec),
    },
  )
}

async function updateWorktreeCleanupState(projectSlug: string, folderName: string, target: TicketWorktreeTarget): Promise<void> {
  if (fs.existsSync(target.worktreePath)) return
  const [localBranchExists, remoteBranchExists] = await Promise.all([
    agentWorktreeManager.localBranchExists(target.project.path, target.branchName),
    agentWorktreeManager.hasRemoteBranch(target.project.path, target.branchName),
  ])
  mutateTickets(projectSlug, (store) =>
    store.markAgentWorktreeRemoved(folderName, target.worktreePath, !localBranchExists && !remoteBranchExists),
  )
}

export async function worktreeCleanup(
  projectSlug: string,
  folderName: string,
  options: TicketCleanupOptions,
): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const target = resolveTicketWorktreeTarget(projectSlug, folderName, options.worktreePath)
    const { project, ticket, worktreePath, branchName } = target
    if (options.stopHerdrAgent) {
      const found = await findHerdrAgent(
        {
          projectSlug,
          folderName: ticket ? ticketAgentKey(folderName, ticket, worktreePath) : folderName,
        },
        herdrExec,
      )
      if (found.kind === 'herdr-unavailable') {
        throw createValidationError(found.message)
      }
      if (found.kind === 'no-agent') {
        throw createValidationError(`No Herdr agent found for ticket '${folderName}'.`)
      }
      await stopHerdrAgent(found.paneId, herdrExec)
    }
    try {
      await cleanupWorktree(agentWorktreeManager, project.path, branchName, worktreePath, options, project.mainBranch)
    } finally {
      if (options.deleteWorktree && !fs.existsSync(worktreePath)) {
        await diffReviewStore.removeTicket(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
      }
      await updateWorktreeCleanupState(projectSlug, folderName, target)
    }
    if (options.deleteLocalBranch) {
      await diffReviewStore.removeTicket(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
    }
    return success(undefined)
  } catch (e) {
    const payload = errorPayload(e)
    return failure({
      type: 'error' as const,
      ...payload,
    })
  }
}

export async function getWorktreeLockingProcesses(
  projectSlug: string,
  folderName: string,
  selectedWorktreePath: string | null = null,
): Promise<LockingProcessInfo[]> {
  'use server'

  const { worktreePath } = resolveTicketWorktreeTarget(projectSlug, folderName, selectedWorktreePath ?? undefined)
  return agentWorktreeManager.findLockingProcesses(worktreePath)
}

export async function killWorktreeLockingProcesses(
  projectSlug: string,
  folderName: string,
  pids: number[],
): Promise<Result<undefined, UserFacingError>> {
  'use server'

  const failed: string[] = []
  for (const pid of pids) {
    if (pid < 2 || pid === process.pid) continue
    try {
      process.kill(pid)
    } catch (e: any) {
      failed.push(`PID ${pid}: ${e?.message ?? 'Unknown error'}`)
    }
  }
  if (failed.length > 0) {
    return failure({
      title: 'Stop processes failed',
      description: `Failed to kill: ${failed.join(', ')}`,
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  return success(undefined)
}

export async function forceDeleteLocalBranch(
  projectSlug: string,
  folderName: string,
  selectedWorktreePath: string | null = null,
): Promise<Result<undefined, UserFacingError>> {
  'use server'

  try {
    const target = resolveTicketWorktreeTarget(projectSlug, folderName, selectedWorktreePath ?? undefined)
    const { project, branchName, worktreePath } = target
    await agentWorktreeManager.forceDeleteLocalBranch(project.path, branchName)
    await updateWorktreeCleanupState(projectSlug, folderName, target)
    await diffReviewStore.removeTicket(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
    return success(undefined)
  } catch (e: any) {
    return failure(errorPayload(e, 'Delete branch failed'))
  }
}

export interface ContextResult {
  content: string
}

export interface UploadFileResult {
  results: Result<UploadedFile, FileUploadError>[]
}

export interface UploadedFile {
  name: string
}

export interface FileUploadError extends UserFacingError {
  name: string
}

export interface SuccessSyncTicketsResult {
  status: 'success'
}

export interface ConflictSyncTicketsResult {
  status: 'conflict'
}

export interface TicketWorktreeTarget {
  project: ProjectInfo
  ticket: TicketInfo | null
  worktreePath: string
  branchName: string
}
