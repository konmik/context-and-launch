import type { GroupTaskResult } from '../forest/forest-api.js'
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
  taskSyncManager,
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
import { createTaskStore, type TaskStore, type TaskInfo } from '~/core/task/task-store.js'
import { taskAgentWorktrees, taskAgentKey } from '~/core/task/task-worktrees.js'
import type { StatusJson } from '~/core/task/task-repository.js'
import type { TaskOrder } from '~/core/task/task-order-data.js'
import { failure, success } from '~/util/result.js'
import { extractPrefixFromInput } from '~/core/task/task-number.js'
import { cleanupWorktree } from '~/core/worktree/worktree-cleanup.js'
import { resolveAgentWorktreeLocation, worktreeInstanceName } from '~/core/worktree/worktree-naming.js'
import { runTaskCleanupChecks } from '~/core/worktree/task-cleanup-checks.js'
import type { TaskCleanupStatus, TaskCleanupOptions } from '~/core/worktree/task-cleanup-checks.js'
import { findHerdrAgent, stopHerdrAgent } from '~/core/herdr/herdr-control.js'
import { createValidationError, createNotFoundError, errorPayload, errorResult } from '~/core/shared/errors.js'
import { resolveInitialTaskStatus } from '~/core/board/initial-task-status.js'
import type { LockingProcessInfo } from '~/core/worktree/agent-worktree.js'
import { diffReviewWorktreeIdentity } from '~/core/diff-review/diff-review-target.js'

function mutateTasks<T>(projectSlug: string, mutation: (store: TaskStore) => T): T {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return mutation(createTaskStore(worktreeDir))
  } finally {
    worktreeRevisions.bump(worktreeDir)
  }
}

async function mutateTasksExclusive<T>(projectSlug: string, mutation: (store: TaskStore) => T): Promise<T> {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  try {
    return await fileWatcher.runWithWatchPaused(worktreeDir, () => mutation(createTaskStore(worktreeDir)))
  } finally {
    worktreeRevisions.bump(worktreeDir)
  }
}

export async function createTask(projectSlug: string, number: string, title: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const initialStatus = resolveInitialTaskStatus(projectSlug, {
      projectRegistry,
      boardConfigManager,
    })
    mutateTasks(projectSlug, (store) => store.createTask(number, title, initialStatus))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function updateTask(
  projectSlug: string,
  folderName: string,
  number: string | null,
  title: string | null,
  status: string | null,
): Promise<Result<GroupTaskResult, ActionError>> {
  'use server'

  try {
    const updated = await mutateTasksExclusive(projectSlug, (store) => store.updateTask(folderName, number, title, status))
    return success({
      folderName: updated.folderName,
    })
  } catch (e) {
    return errorResult(e)
  }
}

export async function deleteTask(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    await mutateTasksExclusive(projectSlug, (store) => store.deleteTask(folderName))
    await diffReviewStore.removeTask(projectSlug, folderName)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function archiveTask(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    await mutateTasksExclusive(projectSlug, (store) => store.archiveTask(folderName))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function readTaskOrder(projectSlug: string): Promise<Result<TaskOrder, UserFacingError>> {
  'use server'

  try {
    return success(createTaskStore(worktreeManager.getWorktreeDir(projectSlug)).orderStore.read())
  } catch (error) {
    return failure(errorPayload(error, 'Load task order failed'))
  }
}

export async function saveTaskOrder(
  projectSlug: string,
  expected: TaskOrder,
  order: TaskOrder,
): Promise<Result<TaskOrder, UserFacingError>> {
  'use server'

  try {
    return success(
      mutateTasks(projectSlug, (store) => {
        store.orderStore.write(order, expected)
        return order
      }),
    )
  } catch (error) {
    return failure(errorPayload(error, 'Save task order failed'))
  }
}

function withAgentWorktreeStatus(projectSlug: string, task: TaskInfo): TaskInfo {
  const { worktreePath } = resolveAgentWorktreeLocation(task.folderName, launcherConfigManager.resolveWorktreeSettings(projectSlug), {
    savedWorktreePath: task.agentWorktreeDir,
  })
  return {
    ...task,
    hasAgentWorktree: fs.existsSync(worktreePath),
  }
}

export const getTask = query(async (projectSlug: string, folderName: string): Promise<TaskInfo> => {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const task = createTaskStore(worktreeDir).getTask(folderName)
  if (!task) throw createNotFoundError(`Task not found: ${folderName}`)
  return withAgentWorktreeStatus(projectSlug, task)
}, 'task-detail')

export async function getContext(projectSlug: string, folderName: string, contextFileName: string): Promise<ContextResult | null> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = createTaskStore(worktreeDir)
  const content = store.getTaskContext(folderName, contextFileName)
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
    mutateTasks(projectSlug, (store) => store.saveTaskContext(folderName, contextFileName, content))
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
    mutateTasks(projectSlug, (store) => store.deleteTaskContext(folderName, contextFileName))
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function deleteFile(projectSlug: string, folderName: string, fileName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    mutateTasks(projectSlug, (store) => store.deleteTaskFile(folderName, fileName))
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
      const store = createTaskStore(worktreeDir)
      const results: Result<UploadedFile, FileUploadError>[] = []
      for (const [, value] of formData.entries()) {
        if (!(value instanceof File)) continue
        const fileName = value.name
        try {
          const arrayBuffer = await value.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          store.copyFileToTask(folderName, fileName, buffer)
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

export const saveTaskStatus = action(async (projectSlug: string, previousJson: string, nextJson: string) => {
  'use server'

  try {
    const previous: TaskInfo = JSON.parse(previousJson)
    const next: TaskInfo = JSON.parse(nextJson)
    const updated = await mutateTasksExclusive(projectSlug, (store) => {
      const details: Partial<Pick<StatusJson, 'useWorktree' | 'references'>> = {}
      if (next.useWorktree !== previous.useWorktree) details.useWorktree = next.useWorktree
      const removed = previous.references.filter((ref) => !next.references.some((nextRef) => nextRef.path === ref.path))
      const added = next.references.filter((ref) => !previous.references.some((previousRef) => previousRef.path === ref.path))
      const current = store.getTask(previous.folderName)
      if (!current) throw createNotFoundError(`Task not found: ${previous.folderName}`)
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
      return store.updateTask(
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
    return respond(failure(errorPayload(error, 'Save task failed')), {
      revalidate: [],
    })
  }
}, 'save-task-status')

export const addTaskWorktree = action(
  async (projectSlug: string, folderName: string): Promise<ResponseEnvelope<Result<undefined, UserFacingError>>> => {
    'use server'

    try {
      const project = projectRegistry.listProjects().find((entry) => entry.projectSlug === projectSlug)
      if (!project) throw createNotFoundError('Project not found')
      const store = createTaskStore(worktreeManager.getWorktreeDir(projectSlug))
      const task = store.getTask(folderName)
      if (!task) throw createNotFoundError('Task not found')
      if (taskAgentWorktrees(task).length === 0) {
        const legacy = resolveAgentWorktreeLocation(folderName, launcherConfigManager.resolveWorktreeSettings(projectSlug))
        if (agentWorktreeManager.isGitWorktree(legacy.worktreePath)) {
          const ownership = await agentWorktreeManager.getWorktreeOwnership(project.path, legacy.worktreePath)
          if (ownership.kind !== 'current-project') throw createValidationError('The existing task worktree belongs to another project.')
          mutateTasks(projectSlug, (currentStore) => currentStore.saveAgentWorktreeInfo(folderName, legacy.branchName, legacy.worktreePath))
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
      mutateTasks(projectSlug, (currentStore) => {
        currentStore.saveAgentWorktreeInfo(
          folderName,
          result.value.branchName,
          result.value.worktreePath,
          `${folderName}--worktree-${instanceId}`,
        )
        currentStore.selectAgentWorktree(folderName, result.value.worktreePath)
      })
      return respond(success(undefined), {
        revalidate: [getTask.keyFor(projectSlug, folderName)],
      })
    } catch (error) {
      return respond(failure(errorPayload(error, 'Add worktree failed')), {
        revalidate: [],
      })
    }
  },
  'add-task-worktree',
)

export const selectTaskWorktree = action(
  async (
    projectSlug: string,
    folderName: string,
    worktreePath: string | null,
  ): Promise<ResponseEnvelope<Result<undefined, UserFacingError>>> => {
    'use server'

    try {
      mutateTasks(projectSlug, (store) => store.selectAgentWorktree(folderName, worktreePath ?? undefined))
      return respond(success(undefined), {
        revalidate: [getTask.keyFor(projectSlug, folderName)],
      })
    } catch (error) {
      return respond(failure(errorPayload(error, 'Select worktree failed')), {
        revalidate: [],
      })
    }
  },
  'select-task-worktree',
)

export const syncTasks = action(async function syncTasks(
  projectSlug: string,
): Promise<ResponseEnvelope<Result<SuccessSyncTasksResult | ConflictSyncTasksResult, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    const result = await fileWatcher.runWithWatchPaused(worktreeDir, async () => {
      const result = await operationTracker.track(taskSyncManager.sync(worktreeDir))
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
}, 'sync-tasks')

export const getWorktreeRevision = query(async (projectSlug: string): Promise<number> => {
  'use server'

  return worktreeRevisions.current(worktreeManager.getWorktreeDir(projectSlug))
}, 'worktree-revision')

export const getSyncPending = query(async (projectSlug: string): Promise<boolean> => {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  return syncPendingTracker.hasPendingChanges(worktreeDir)
}, 'sync-pending')

export async function suggestTaskNumber(projectSlug: string, numberInput: string): Promise<string | null> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = createTaskStore(worktreeDir)
  const prefix = extractPrefixFromInput(numberInput)
  return store.suggestNextNumber(prefix)
}

function resolveTaskWorktreeTarget(projectSlug: string, folderName: string, selectedWorktreePath?: string): TaskWorktreeTarget {
  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
  if (!project) throw createNotFoundError('Project not found')
  const store = createTaskStore(worktreeManager.getWorktreeDir(projectSlug))
  const task = store.getTask(folderName)
  const selected = task && taskAgentWorktrees(task).find((entry) => entry.worktreePath === selectedWorktreePath)
  if (selectedWorktreePath && !selected) throw createValidationError('The selected worktree does not belong to this task.')
  const { worktreePath, branchName } = resolveAgentWorktreeLocation(
    folderName,
    launcherConfigManager.resolveWorktreeSettings(projectSlug),
    {
      savedWorktreePath: selected?.worktreePath ?? task?.agentWorktreeDir,
      savedBranchName: selected?.branchName ?? task?.agentWorktreeBranchName,
    },
  )
  return {
    project,
    task,
    worktreePath,
    branchName,
  }
}

export async function openTaskWorktree(projectSlug: string, folderName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const { worktreePath } = resolveTaskWorktreeTarget(projectSlug, folderName)
    if (!fs.existsSync(worktreePath)) {
      throw createNotFoundError(`Worktree does not exist: ${worktreePath}`)
    }
    await openInOs(worktreePath, commandTemplateService)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function openTaskFolder(projectSlug: string, folderName: string): Promise<Result<void, UserFacingError>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    const store = createTaskStore(worktreeDir)
    if (!store.getTask(folderName)) throw createNotFoundError(`Task not found: ${folderName}`)
    await openInOs(path.join(worktreeDir, folderName), commandTemplateService)
    return success(undefined)
  } catch (error) {
    return failure(errorPayload(error, 'Open task folder failed'))
  }
}

export async function getCleanupStatus(
  projectSlug: string,
  folderName: string,
  selectedWorktreePath: string | null = null,
): Promise<TaskCleanupStatus> {
  'use server'

  appLog('task-cleanup', 'Checking cleanup status', {
    projectSlug,
    folderName,
    selectedWorktreePath: selectedWorktreePath ?? undefined,
  })
  const { project, task, worktreePath, branchName } = resolveTaskWorktreeTarget(projectSlug, folderName, selectedWorktreePath ?? undefined)
  appLog('task-cleanup', 'Resolved cleanup target', {
    projectSlug,
    folderName,
    worktreePath,
    branchName,
  })
  return runTaskCleanupChecks(
    {
      projectSlug,
      folderName: task ? taskAgentKey(folderName, task, worktreePath) : folderName,
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

async function updateWorktreeCleanupState(projectSlug: string, folderName: string, target: TaskWorktreeTarget): Promise<void> {
  if (fs.existsSync(target.worktreePath)) return
  const [localBranchExists, remoteBranchExists] = await Promise.all([
    agentWorktreeManager.localBranchExists(target.project.path, target.branchName),
    agentWorktreeManager.hasRemoteBranch(target.project.path, target.branchName),
  ])
  mutateTasks(projectSlug, (store) =>
    store.markAgentWorktreeRemoved(folderName, target.worktreePath, !localBranchExists && !remoteBranchExists),
  )
}

export async function worktreeCleanup(
  projectSlug: string,
  folderName: string,
  options: TaskCleanupOptions,
): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const target = resolveTaskWorktreeTarget(projectSlug, folderName, options.worktreePath)
    const { project, task, worktreePath, branchName } = target
    if (options.stopHerdrAgent) {
      const found = await findHerdrAgent(
        {
          projectSlug,
          folderName: task ? taskAgentKey(folderName, task, worktreePath) : folderName,
        },
        herdrExec,
      )
      if (found.kind === 'herdr-unavailable') {
        throw createValidationError(found.message)
      }
      if (found.kind === 'no-agent') {
        throw createValidationError(`No Herdr agent found for task '${folderName}'.`)
      }
      await stopHerdrAgent(found.paneId, herdrExec)
    }
    try {
      await cleanupWorktree(agentWorktreeManager, project.path, branchName, worktreePath, options, project.mainBranch)
    } finally {
      if (options.deleteWorktree && !fs.existsSync(worktreePath)) {
        await diffReviewStore.removeTask(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
      }
      await updateWorktreeCleanupState(projectSlug, folderName, target)
    }
    if (options.deleteLocalBranch) {
      await diffReviewStore.removeTask(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
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

  const { worktreePath } = resolveTaskWorktreeTarget(projectSlug, folderName, selectedWorktreePath ?? undefined)
  return agentWorktreeManager.findLockingProcesses(worktreePath)
}

export async function killWorktreeLockingProcesses(pids: number[]): Promise<Result<undefined, UserFacingError>> {
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
    const target = resolveTaskWorktreeTarget(projectSlug, folderName, selectedWorktreePath ?? undefined)
    const { project, branchName, worktreePath } = target
    await agentWorktreeManager.forceDeleteLocalBranch(project.path, branchName)
    await updateWorktreeCleanupState(projectSlug, folderName, target)
    await diffReviewStore.removeTask(projectSlug, folderName, diffReviewWorktreeIdentity(worktreePath, branchName))
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

export interface SuccessSyncTasksResult {
  status: 'success'
}

export interface ConflictSyncTasksResult {
  status: 'conflict'
}

export interface TaskWorktreeTarget {
  project: ProjectInfo
  task: TaskInfo | null
  worktreePath: string
  branchName: string
}
