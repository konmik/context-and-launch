import type { GroupTicketResult } from '../forest/forest-api.js'
import type { ActionError } from '../../core/shared/errors.js'
import type { Result } from '../../util/result.js'
import type { ResponseEnvelope } from '@solidjs/web'
import type { ProjectInfo } from '../../core/project/project-registry.js'
import fs from 'fs'
import path from 'path'
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
import { TicketStore, type TicketInfo } from '~/core/ticket/ticket-store.js'
import type { StatusJson } from '~/core/ticket/ticket-repository.js'
import type { TicketOrder } from '~/core/ticket/ticket-order-data.js'
import { failure, success } from '~/util/result.js'
import { extractPrefixFromInput } from '~/core/ticket/ticket-number.js'
import { WorktreeCleanupService } from '~/core/worktree/worktree-cleanup.js'
import { resolveAgentWorktreeLocation } from '~/core/worktree/worktree-naming.js'
import { runTicketCleanupChecks } from '~/core/worktree/ticket-cleanup-checks.js'
import type { TicketCleanupStatus, TicketCleanupOptions } from '~/core/worktree/ticket-cleanup-checks.js'
import { findHerdrAgent, stopHerdrAgent } from '~/core/herdr/herdr-control.js'
import { ValidationError, NotFoundError, errorMessage, errorPayload, errorResult } from '~/core/shared/errors.js'
import { resolveInitialTicketStatus } from '~/core/board/initial-ticket-status.js'
import type { LockingProcessInfo } from '~/core/worktree/agent-worktree.js'

function mutateTickets<T>(projectSlug: string, mutation: (store: TicketStore) => T): T {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return mutation(new TicketStore(worktreeDir))
  } finally {
    worktreeRevisions.bump(worktreeDir)
  }
}

async function mutateTicketsExclusive<T>(projectSlug: string, mutation: (store: TicketStore) => T): Promise<T> {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return await fileWatcher.runWithWatchPaused(worktreeDir, () => mutation(new TicketStore(worktreeDir)))
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

export async function readTicketOrder(projectSlug: string): Promise<Result<TicketOrder, string>> {
  'use server'

  try {
    return success(new TicketStore(worktreeManager.getWorktreeDir(projectSlug)).orderStore.read())
  } catch (error) {
    return failure(errorMessage(error))
  }
}

export async function saveTicketOrder(
  projectSlug: string,
  expected: TicketOrder,
  order: TicketOrder,
): Promise<Result<TicketOrder, string>> {
  'use server'

  try {
    return success(
      mutateTickets(projectSlug, (store) => {
        store.orderStore.write(order, expected)
        return order
      }),
    )
  } catch (error) {
    return failure(errorMessage(error))
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
  const ticket = new TicketStore(worktreeDir).getTicket(folderName)
  if (!ticket) throw new NotFoundError(`Ticket not found: ${folderName}`)
  return withAgentWorktreeStatus(projectSlug, ticket)
}, 'ticket-detail')

export async function getContext(projectSlug: string, folderName: string, contextFileName: string): Promise<ContextResult | null> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = new TicketStore(worktreeDir)
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
      const store = new TicketStore(worktreeDir)
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
              message: errorMessage(e),
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
      if (!current) throw new NotFoundError(`Ticket not found: ${previous.folderName}`)
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
    return respond(failure(errorMessage(error)), {
      revalidate: [],
    })
  }
}, 'save-ticket-status')
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
  const store = new TicketStore(worktreeDir)
  const prefix = extractPrefixFromInput(numberInput)
  return store.suggestNextNumber(prefix)
}

function resolveTicketCleanupTarget(projectSlug: string, folderName: string): ResolveTicketCleanupTargetResult {
  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
  if (!project) throw new NotFoundError('Project not found')
  const store = new TicketStore(worktreeManager.getWorktreeDir(projectSlug))
  const ticket = store.getTicket(folderName)
  const { worktreePath, branchName } = resolveAgentWorktreeLocation(
    folderName,
    launcherConfigManager.resolveWorktreeSettings(projectSlug),
    {
      savedWorktreePath: ticket?.agentWorktreeDir ?? undefined,
      savedBranchName: ticket?.agentWorktreeBranchName ?? undefined,
    },
  )
  return {
    project,
    store,
    ticket,
    worktreePath,
    branchName,
  }
}

export async function openTicketWorktree(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const { worktreePath } = resolveTicketCleanupTarget(projectSlug, folderName)
    if (!fs.existsSync(worktreePath)) {
      throw new NotFoundError(`Worktree does not exist: ${worktreePath}`)
    }
    await openInOs(worktreePath, commandTemplateService)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function openTicketFolder(projectSlug: string, folderName: string): Promise<void> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = new TicketStore(worktreeDir)
  if (!store.getTicket(folderName)) throw new NotFoundError(`Ticket not found: ${folderName}`)
  await openInOs(path.join(worktreeDir, folderName), commandTemplateService)
}

export async function getCleanupStatus(projectSlug: string, folderName: string): Promise<TicketCleanupStatus> {
  'use server'

  const { project, worktreePath, branchName } = resolveTicketCleanupTarget(projectSlug, folderName)
  return runTicketCleanupChecks(
    {
      projectSlug,
      folderName,
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
      isBranchMerged: (projectPath, branchName, mainBranch) => agentWorktreeManager.isBranchMerged(projectPath, branchName, mainBranch),
      hasRemoteBranch: (projectPath, branchName) => agentWorktreeManager.hasRemoteBranch(projectPath, branchName),
      findHerdrAgent: (target) => findHerdrAgent(target, herdrExec),
    },
  )
}

export async function worktreeCleanup(
  projectSlug: string,
  folderName: string,
  options: TicketCleanupOptions,
): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const { project, store, ticket, worktreePath, branchName } = resolveTicketCleanupTarget(projectSlug, folderName)
    if (options.stopHerdrAgent) {
      const found = await findHerdrAgent(
        {
          projectSlug,
          folderName,
        },
        herdrExec,
      )
      if (found.kind === 'herdr-unavailable') {
        throw new ValidationError(found.message)
      }
      if (found.kind === 'no-agent') {
        throw new ValidationError(`No Herdr agent found for ticket '${folderName}'.`)
      }
      await stopHerdrAgent(found.paneId, herdrExec)
    }
    try {
      await new WorktreeCleanupService(agentWorktreeManager).cleanup(
        project.path,
        branchName,
        worktreePath,
        {
          deleteWorktree: options.deleteWorktree,
          deleteLocalBranch: options.deleteLocalBranch,
          deleteRemoteBranch: options.deleteRemoteBranch,
        },
        project.mainBranch,
      )
    } finally {
      if (options.deleteWorktree && !fs.existsSync(worktreePath)) {
        await diffReviewStore.removeTicket(projectSlug, folderName)
      }
    }
    if (ticket?.agentWorktreeBranchName && (options.deleteWorktree || options.deleteLocalBranch)) {
      store.clearAgentWorktreeInfo(folderName)
    }
    if (options.deleteLocalBranch) {
      await diffReviewStore.removeTicket(projectSlug, folderName)
    }
    return success(undefined)
  } catch (e) {
    const payload = errorPayload(e)
    return failure({
      type: 'error' as const,
      message: payload.description,
      errorInfo: payload,
    })
  }
}

export async function getWorktreeLockingProcesses(projectSlug: string, folderName: string): Promise<LockingProcessInfo[]> {
  'use server'

  const { worktreePath } = resolveTicketCleanupTarget(projectSlug, folderName)
  return agentWorktreeManager.findLockingProcesses(worktreePath)
}

export async function killWorktreeLockingProcesses(
  projectSlug: string,
  folderName: string,
  pids: number[],
): Promise<Result<undefined, string>> {
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
    return failure(`Failed to kill: ${failed.join(', ')}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  return success(undefined)
}

export async function forceDeleteLocalBranch(projectSlug: string, folderName: string): Promise<Result<undefined, string>> {
  'use server'

  try {
    const { project, store, ticket, branchName } = resolveTicketCleanupTarget(projectSlug, folderName)
    await agentWorktreeManager.forceDeleteLocalBranch(project.path, branchName)
    if (ticket?.agentWorktreeBranchName) {
      store.clearAgentWorktreeInfo(folderName)
    }
    await diffReviewStore.removeTicket(projectSlug, folderName)
    return success(undefined)
  } catch (e: any) {
    return failure(errorMessage(e))
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

export interface FileUploadError {
  name: string
  message: string
}

export interface SuccessSyncTicketsResult {
  status: 'success'
}

export interface ConflictSyncTicketsResult {
  status: 'conflict'
}

export interface ResolveTicketCleanupTargetResult {
  project: ProjectInfo
  store: TicketStore
  ticket: TicketInfo | null
  worktreePath: string
  branchName: string
}
