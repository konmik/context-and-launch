import path from 'path'
import type { Dirent } from 'fs'
import * as v from 'valibot'
import { createTaskOrderStore, type TaskOrderStore } from './task-order.js'
import { createForestLayoutStore, type ForestLayoutStore } from './forest-layout-store.js'
import { suggestNextTaskNumber } from './task-number.js'
import { toKebabCase, normalizeTaskNumber, requireNonBlank, requireSimpleName } from './task-naming.js'
import { createTaskRepository, type TaskRepository } from './task-repository.js'
import { createValidationError, createNotFoundError, createAppError, errorMessage } from '../shared/errors.js'
import { mapConcurrent } from '../shared/concurrency.js'
import {
  wouldCreateDependencyCycle,
  wouldCreateMembershipCycle,
  rewriteInboundReferences,
  removeInboundReferences,
  type TaskRelation,
} from './task-relations.js'
import type { StatusJson } from './task-repository.js'
import type { TaskOrder } from './task-order-data.js'
import { taskAgentWorktrees, type TaskAgentWorktree } from './task-worktrees.js'

export { toKebabCase } from './task-naming.js'

const READ_CONCURRENCY = 32

const isTaskDirEntry = (entry: Dirent): boolean => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive'

export interface TaskInfo {
  number: string
  title: string
  status: string
  folderName: string
  contextNames: string[]
  useWorktree: boolean
  hasAgentWorktree: boolean
  fileNames: string[]
  references: {
    path: string
    exists: boolean
  }[]
  agentWorktreeBranchName?: string
  agentWorktreeDir?: string
  agentWorktrees?: TaskAgentWorktree[]
  dependsOn?: string[]
  memberOf?: string
  createdAt?: string
}

export const CreateTaskBody = v.object({
  number: v.string(),
  title: v.string(),
})

export type CreateTaskBody = v.InferOutput<typeof CreateTaskBody>

export const UpdateTaskBody = v.object({
  number: v.optional(v.string()),
  title: v.optional(v.string()),
  status: v.optional(v.string()),
})

export type UpdateTaskBody = v.InferOutput<typeof UpdateTaskBody>

export const SaveContextBody = v.object({
  content: v.string(),
})

export type SaveContextBody = v.InferOutput<typeof SaveContextBody>

export const AddReferencesBody = v.object({
  paths: v.optional(v.array(v.string()), []),
})

export type AddReferencesBody = v.InferOutput<typeof AddReferencesBody>

export const RemoveReferenceBody = v.object({
  path: v.string(),
})

export type RemoveReferenceBody = v.InferOutput<typeof RemoveReferenceBody>

export interface TaskStore {
  readonly orderStore: TaskOrderStore
  readonly forestLayoutStore: ForestLayoutStore
  getTask(folderName: string): TaskInfo | null
  listTasks(): TaskInfo[]
  createTask(number: string, title: string, initialStatus?: string, memberOf?: string): TaskInfo
  updateTask(
    folderName: string,
    number?: string | null,
    title?: string | null,
    status?: string | null,
    details?: Partial<Pick<StatusJson, 'useWorktree' | 'references'>>,
  ): TaskInfo
  deleteTask(folderName: string): void
  archiveTask(folderName: string): void
  setUseWorktree(folderName: string, value: boolean): void
  saveAgentWorktreeInfo(folderName: string, agentWorktreeBranchName: string, agentWorktreeDir: string, agentKey?: string): void
  selectAgentWorktree(folderName: string, worktreePath?: string): void
  markAgentWorktreeRemoved(folderName: string, worktreePath: string, cleanupComplete?: boolean): void
  getTaskContext(folderName: string, name: string): string | null
  deleteTaskContext(folderName: string, name: string): void
  saveTaskContext(folderName: string, name: string, content: string): void
  listAllTaskNumbers(): Array<ListAllTaskNumbersResult>
  suggestNextNumber(prefix?: string | null): string | null
  loadBoardSnapshot(columns: string[]): Promise<LoadBoardSnapshotResult>
  listTaskFiles(folderName: string): string[]
  copyFileToTask(folderName: string, fileName: string, content: Buffer): void
  deleteTaskFile(folderName: string, fileName: string): void
  getFileContent(folderName: string, fileName: string): Buffer
  addReference(folderName: string, refPath: string): void
  removeReference(folderName: string, refPath: string): void
  addDependency(folderName: string, dependencyNumber: string): void
  removeDependencies(folderName: string, dependencyNumbers: string[]): void
  createGroup(
    number: string,
    title: string,
    initialStatus: string,
    memberFolderNames: string[],
    parentGroupNumber?: string,
    position?: {
      x: number
      y: number
    },
  ): TaskInfo
  ungroup(folderName: string): void
  getReferencedFileContent(folderName: string, refPath: string): Buffer
}

export function createTaskStore(worktreeDir: string, repo: TaskRepository = createTaskRepository()): TaskStore {
  const orderStore = createTaskOrderStore(worktreeDir, repo)
  const forestLayoutStore = createForestLayoutStore(worktreeDir, repo)
  let worktreeRootWithSep: string | undefined

  function requireContained(filePath: string, label: string): void {
    requireContainedIn(filePath, worktreeDir, label)
  }

  function requireContainedIn(filePath: string, parent: string, label: string): void {
    let canonical: string
    if (repo.exists(filePath)) {
      canonical = repo.realpathSync(filePath)
    } else {
      const dir = path.dirname(filePath)
      const base = path.basename(filePath)
      if (repo.exists(dir)) {
        canonical = path.join(repo.realpathSync(dir), base)
      } else {
        canonical = path.resolve(filePath)
      }
    }
    const root = parent === worktreeDir ? cachedWorktreeRootWithSep() : resolveRootWithSep(parent)
    if (!canonical.startsWith(root)) {
      throw createValidationError(`${label} escapes allowed directory: ${canonical}`)
    }
  }

  function resolveRootWithSep(parent: string): string {
    if (!repo.exists(parent)) {
      throw createNotFoundError(`Worktree directory does not exist: ${parent}`)
    }
    return repo.realpathSync(parent) + path.sep
  }

  function cachedWorktreeRootWithSep(): string {
    if (worktreeRootWithSep === undefined) {
      worktreeRootWithSep = resolveRootWithSep(worktreeDir)
    }
    return worktreeRootWithSep
  }

  function resolveTaskDir(folderName: string): string {
    requireSimpleName(folderName, 'folderName')
    const dir = path.join(worktreeDir, folderName)
    requireContained(dir, 'folderName')
    if (!repo.isDirectory(dir)) {
      throw createNotFoundError(`Task not found: ${folderName}`)
    }
    return dir
  }

  function getTask(folderName: string): TaskInfo | null {
    requireSimpleName(folderName, 'folderName')
    const dir = path.join(worktreeDir, folderName)
    requireContained(dir, 'folderName')
    if (!repo.isDirectory(dir)) return null
    return readTask(dir)
  }

  function listTasks(): TaskInfo[] {
    const tasks: TaskInfo[] = []
    for (const dir of taskDirs(false)) {
      const task = readTask(dir)
      if (task) tasks.push(task)
    }
    return dedupeAndSortTasks(tasks)
  }

  function dedupeAndSortTasks(tasks: TaskInfo[]): TaskInfo[] {
    const numbers = new Map<string, string>()
    for (const task of tasks) {
      const normalizedNumber = normalizeTaskNumber(task.number)
      const existingNumber = numbers.get(normalizedNumber)
      if (existingNumber) {
        throw createValidationError(`Duplicate Task Number: ${existingNumber}`, 'number')
      }
      numbers.set(normalizedNumber, task.number)
    }
    tasks.sort((a, b) => a.number.toLowerCase().localeCompare(b.number.toLowerCase()))
    return tasks
  }

  function createTask(number: string, title: string, initialStatus: string = 'todo', memberOf?: string): TaskInfo {
    if (!number.trim()) throw createValidationError('Task number must not be blank', 'number')
    if (!title.trim()) throw createValidationError('Task title must not be blank', 'title')
    assertTaskNumberAvailable(number)
    const baseFolderName = toKebabCase(`${number} ${title}`)
    const dir = resolveUniqueFolderPath(baseFolderName)
    repo.createDirectory(dir)
    const statusData: StatusJson = {
      number: number.trim(),
      title: title.trim(),
      status: initialStatus,
      useWorktree: false,
      createdAt: new Date().toISOString(),
    }
    if (memberOf !== undefined) statusData.memberOf = memberOf
    repo.writeStatusJson(dir, statusData)
    const task = readTask(dir)!
    orderStore.appendTask(task.folderName, initialStatus)
    return task
  }

  function updateTask(
    folderName: string,
    number?: string | null,
    title?: string | null,
    status?: string | null,
    details: Partial<Pick<StatusJson, 'useWorktree' | 'references'>> = {},
  ): TaskInfo {
    return repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTaskDir(folderName)
      const current = repo.readStatusJson(dir)
      if (!current) throw createValidationError(`Malformed task: ${folderName}`)
      const updatedNumber = number != null ? requireNonBlank(number, 'Task number') : current.number
      const updatedTitle = title != null ? requireNonBlank(title, 'Task title') : current.title
      const updatedStatus = status ?? current.status
      const updated: StatusJson = {
        ...current,
        ...details,
        number: updatedNumber,
        title: updatedTitle,
        status: updatedStatus,
      }
      const numberChanged = number != null && number.trim() !== current.number
      const numberIdentityChanged = number != null && normalizeTaskNumber(number) !== normalizeTaskNumber(current.number)
      const needsRename = numberChanged || (title != null && title.trim() !== current.title)
      if (numberIdentityChanged) {
        assertTaskNumberAvailable(updatedNumber, dir)
      }
      let finalDir = dir
      if (needsRename) {
        const newFolderName = toKebabCase(`${updated.number} ${updated.title}`)
        if (newFolderName !== folderName) {
          const newDir = path.join(worktreeDir, newFolderName)
          if (repo.exists(newDir)) {
            throw createValidationError(`Folder name collision: ${newFolderName}`, 'title')
          }
          try {
            repo.renameDirectory(dir, newDir)
          } catch (err) {
            throw createAppError(
              `Failed to rename task folder from ${path.basename(dir)} to ${newFolderName}: ${errorMessage(err)}`,
              'Rename task failed',
            )
          }
          finalDir = newDir
        }
      }
      repo.writeStatusJson(finalDir, updated)
      if (needsRename && path.basename(finalDir) !== folderName) {
        orderStore.renameTask(folderName, path.basename(finalDir))
      }
      if (numberChanged) {
        for (const taskDir of taskDirs(true)) {
          if (taskDir === finalDir) continue
          const status = repo.readStatusJson(taskDir)
          if (!status) continue
          const rewritten = rewriteInboundReferences(status, current.number, updatedNumber)
          if (rewritten) repo.writeStatusJson(taskDir, rewritten)
        }
        forestLayoutStore.renameTask(current.number, updatedNumber)
      }
      return readTask(finalDir)!
    })
  }

  function deleteTask(folderName: string): void {
    repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTaskDir(folderName)
      const status = repo.readStatusJson(dir)
      const taskNumber = status?.number
      repo.removeDirectory(dir)
      orderStore.removeTask(folderName)
      if (taskNumber) {
        for (const taskDir of taskDirs(true)) {
          const s = repo.readStatusJson(taskDir)
          if (!s) continue
          const cleaned = removeInboundReferences(s, taskNumber)
          if (cleaned) repo.writeStatusJson(taskDir, cleaned)
        }
        forestLayoutStore.removeTask(taskNumber)
      }
    })
  }

  function archiveTask(folderName: string): void {
    const dir = resolveTaskDir(folderName)
    const archiveDir = path.join(worktreeDir, 'archive')
    repo.createDirectory(archiveDir)
    const dest = path.join(archiveDir, folderName)
    if (repo.exists(dest)) {
      throw createValidationError(`Archive destination already exists: ${folderName}`)
    }
    repo.renameDirectory(dir, dest)
    orderStore.removeTask(folderName)
  }

  function setUseWorktree(folderName: string, value: boolean): void {
    const dir = resolveTaskDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Task not found: ${folderName}`)
    repo.writeStatusJson(dir, {
      ...current,
      useWorktree: value,
    })
  }

  function saveAgentWorktreeInfo(folderName: string, agentWorktreeBranchName: string, agentWorktreeDir: string, agentKey?: string): void {
    const dir = resolveTaskDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Task not found: ${folderName}`)
    repo.writeStatusJson(dir, {
      ...current,
      agentWorktreeBranchName,
      agentWorktreeDir,
      agentWorktrees: [
        ...taskAgentWorktrees(current).filter((entry) => entry.worktreePath !== agentWorktreeDir),
        {
          branchName: agentWorktreeBranchName,
          worktreePath: agentWorktreeDir,
          agentKey: agentKey ?? taskAgentWorktrees(current).find((entry) => entry.worktreePath === agentWorktreeDir)?.agentKey,
        },
      ],
    })
  }

  function selectAgentWorktree(folderName: string, worktreePath?: string): void {
    const dir = resolveTaskDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Task not found: ${folderName}`)
    const agentWorktrees = taskAgentWorktrees(current)
    const selected = agentWorktrees.find((entry) => entry.worktreePath === worktreePath && !entry.removed)
    if (worktreePath && !selected) throw createValidationError('The selected worktree does not belong to this task.')
    repo.writeStatusJson(dir, {
      ...current,
      agentWorktrees,
      useWorktree: !!selected,
      agentWorktreeBranchName: selected?.branchName ?? current.agentWorktreeBranchName,
      agentWorktreeDir: selected?.worktreePath ?? current.agentWorktreeDir,
    })
  }

  function markAgentWorktreeRemoved(folderName: string, worktreePath: string, cleanupComplete?: boolean): void {
    const dir = resolveTaskDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Task not found: ${folderName}`)
    const agentWorktrees = taskAgentWorktrees(current).map((entry) =>
      entry.worktreePath === worktreePath
        ? {
            ...entry,
            removed: true,
            cleanupComplete,
          }
        : entry,
    )
    const selected =
      current.agentWorktreeDir === worktreePath
        ? agentWorktrees.find((entry) => !entry.removed)
        : agentWorktrees.find((entry) => entry.worktreePath === current.agentWorktreeDir)
    repo.writeStatusJson(dir, {
      ...current,
      agentWorktrees,
      useWorktree: current.useWorktree && !!selected,
      agentWorktreeDir: selected?.worktreePath,
      agentWorktreeBranchName: selected?.branchName,
    })
  }

  function getTaskContext(folderName: string, name: string): string | null {
    requireSimpleName(name, 'name')
    const dir = path.join(worktreeDir, folderName)
    requireContained(dir, 'folderName')
    if (!repo.isDirectory(dir)) {
      return null
    }
    const file = path.join(dir, `${name}.md`)
    requireContained(file, 'name')
    requireContainedIn(file, dir, 'name')
    return repo.exists(file) ? repo.readFileText(file) : null
  }

  function deleteTaskContext(folderName: string, name: string): void {
    requireSimpleName(name, 'name')
    const dir = resolveTaskDir(folderName)
    const file = path.join(dir, `${name}.md`)
    requireContained(file, 'name')
    requireContainedIn(file, dir, 'name')
    if (!repo.exists(file)) return
    repo.deleteFile(file)
  }

  function saveTaskContext(folderName: string, name: string, content: string): void {
    requireSimpleName(name, 'name')
    const dir = resolveTaskDir(folderName)
    const file = path.join(dir, `${name}.md`)
    requireContained(file, 'name')
    requireContainedIn(file, dir, 'name')
    repo.writeFile(file, content)
  }

  function listAllTaskNumbers(): Array<ListAllTaskNumbersResult> {
    const results: Array<{
      number: string
      createdAt?: string
    }> = []
    for (const dir of taskDirs(true)) {
      const status = repo.readStatusJson(dir)
      if (status) {
        results.push({
          number: status.number,
          createdAt: status.createdAt,
        })
      }
    }
    return results
  }

  function suggestNextNumber(prefix?: string | null): string | null {
    return suggestNextTaskNumber(listAllTaskNumbers(), prefix)
  }

  function readTask(dir: string): TaskInfo | null {
    const status = repo.readStatusJson(dir)
    if (!status) return null
    const entries = repo.listEntries(dir)
    const references = (status.references ?? []).map((ref) => ({
      path: ref.path,
      exists: repo.exists(ref.path),
    }))
    return buildTaskInfo(dir, status, entries, references)
  }

  function buildTaskInfo(
    dir: string,
    status: StatusJson,
    entries: Dirent[],
    references: {
      path: string
      exists: boolean
    }[],
  ): TaskInfo {
    const contextNames = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, ''))
      .sort()
    const fileNames = entries
      .filter((e) => e.isFile() && e.name !== 'status.json')
      .map((e) => e.name)
      .sort()
    return {
      number: status.number,
      title: status.title,
      status: status.status,
      folderName: path.basename(dir),
      contextNames,
      useWorktree: status.useWorktree === true,
      hasAgentWorktree: false,
      fileNames,
      references,
      agentWorktreeBranchName: status.agentWorktreeBranchName,
      agentWorktreeDir: status.agentWorktreeDir,
      agentWorktrees: taskAgentWorktrees(status),
      dependsOn: status.dependsOn,
      memberOf: status.memberOf,
      createdAt: status.createdAt,
    }
  }

  async function loadBoardSnapshot(columns: string[]): Promise<LoadBoardSnapshotResult> {
    const activeDirs = await taskDirsIn(worktreeDir)
    const tasks = dedupeAndSortTasks(
      (await mapConcurrent(activeDirs, READ_CONCURRENCY, (dir) => readTaskAsync(dir))).filter((t): t is TaskInfo => t !== null),
    )
    const taskOrder = orderStore.reconcileAndSave(tasks, columns)
    const archiveDirs = await taskDirsIn(path.join(worktreeDir, 'archive'))
    const archiveStatuses = archiveDirs.map((dir) => repo.readStatusJson(dir)).filter((s): s is StatusJson => s !== null)
    const suggestedNextNumber = suggestNextTaskNumber([...tasks, ...archiveStatuses])
    return {
      tasks,
      taskOrder,
      suggestedNextNumber,
    }
  }

  async function taskDirsIn(parentDir: string): Promise<string[]> {
    const entries = await repo.listEntriesAsync(parentDir)
    return entries.filter(isTaskDirEntry).map((e) => path.join(parentDir, e.name))
  }

  async function readTaskAsync(dir: string): Promise<TaskInfo | null> {
    const status = repo.readStatusJson(dir)
    if (!status) return null
    const entries = await repo.listEntriesAsync(dir)
    const references = (status.references ?? []).map((ref) => ({
      path: ref.path,
      exists: repo.exists(ref.path),
    }))
    return buildTaskInfo(dir, status, entries, references)
  }

  function listTaskFiles(folderName: string): string[] {
    const dir = resolveTaskDir(folderName)
    const entries = repo.listEntries(dir)
    return entries
      .filter((e) => e.isFile() && e.name !== 'status.json')
      .map((e) => e.name)
      .sort()
  }

  function copyFileToTask(folderName: string, fileName: string, content: Buffer): void {
    requireSimpleName(fileName, 'fileName')
    if (fileName === 'status.json') {
      throw createValidationError('Cannot overwrite status.json', 'file')
    }
    const dir = resolveTaskDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    repo.writeFile(filePath, content)
  }

  function deleteTaskFile(folderName: string, fileName: string): void {
    requireSimpleName(fileName, 'fileName')
    if (fileName === 'status.json') {
      throw createValidationError('Cannot delete status.json', 'file')
    }
    const dir = resolveTaskDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    if (!repo.exists(filePath)) {
      throw createNotFoundError(`File not found: ${fileName}`)
    }
    repo.deleteFile(filePath)
  }

  function getFileContent(folderName: string, fileName: string): Buffer {
    requireSimpleName(fileName, 'fileName')
    const dir = resolveTaskDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    if (!repo.exists(filePath)) {
      throw createNotFoundError(`File not found: ${fileName}`)
    }
    return repo.readFile(filePath)
  }

  function updateStatus(folderName: string, transform: (current: StatusJson) => StatusJson): void {
    const dir = resolveTaskDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createValidationError(`Malformed task: ${folderName}`)
    const next = transform(current)
    if (next !== current) repo.writeStatusJson(dir, next)
  }

  function addReference(folderName: string, refPath: string): void {
    updateStatus(folderName, (current) => {
      const references = current.references ?? []
      return references.some((reference) => reference.path === refPath)
        ? current
        : {
            ...current,
            references: [
              ...references,
              {
                path: refPath,
              },
            ],
          }
    })
  }

  function removeReference(folderName: string, refPath: string): void {
    updateStatus(folderName, (current) => ({
      ...current,
      references: (current.references ?? []).filter((reference) => reference.path !== refPath),
    }))
  }

  function addDependency(folderName: string, dependencyNumber: string): void {
    updateStatus(folderName, (current) => {
      const tasks = listTasks()
      if (!tasks.some((task) => task.number === dependencyNumber)) {
        throw createValidationError(`Dependency target does not exist: ${dependencyNumber}`)
      }
      const existing = current.dependsOn ?? []
      if (existing.includes(dependencyNumber)) return current
      if (wouldCreateDependencyCycle(tasks, current.number, dependencyNumber)) {
        throw createValidationError('Dependency would create a cycle')
      }
      return {
        ...current,
        dependsOn: [...existing, dependencyNumber],
      }
    })
  }

  function removeDependencies(folderName: string, dependencyNumbers: string[]): void {
    updateStatus(folderName, (current) => {
      const removed = new Set(dependencyNumbers)
      const remaining = (current.dependsOn ?? []).filter((number) => !removed.has(number))
      return {
        ...current,
        dependsOn: remaining.length > 0 ? remaining : undefined,
      }
    })
  }

  function createGroup(
    number: string,
    title: string,
    initialStatus: string,
    memberFolderNames: string[],
    parentGroupNumber?: string,
    position?: {
      x: number
      y: number
    },
  ): TaskInfo {
    return repo.runInTransaction(worktreeDir, () => {
      const memberInfos: Array<{
        dir: string
        status: StatusJson
      }> = []
      for (const fn of memberFolderNames) {
        const dir = resolveTaskDir(fn)
        const status = repo.readStatusJson(dir)
        if (!status) throw createNotFoundError(`Member task not found: ${fn}`)
        memberInfos.push({
          dir,
          status,
        })
      }
      const memberNumbers = memberInfos.map((m) => m.status.number)
      const allTasks: TaskRelation[] = listTasks()
      if (parentGroupNumber !== undefined) {
        allTasks.push({
          number,
          memberOf: parentGroupNumber,
        })
      }
      if (wouldCreateMembershipCycle(allTasks, memberNumbers, number)) {
        throw createValidationError('Grouping would create a membership cycle')
      }
      const groupTask = createTask(number, title, initialStatus, parentGroupNumber)
      for (const member of memberInfos) {
        repo.writeStatusJson(member.dir, {
          ...member.status,
          memberOf: number,
        })
      }
      if (position) {
        forestLayoutStore.translateIntoGroup(number, position, memberNumbers)
      }
      return groupTask
    })
  }

  function ungroup(folderName: string): void {
    repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTaskDir(folderName)
      const groupStatus = repo.readStatusJson(dir)
      if (!groupStatus) throw createValidationError(`Malformed task: ${folderName}`)
      const memberNumbers: string[] = []
      for (const taskDir of taskDirs(false)) {
        const status = repo.readStatusJson(taskDir)
        if (!status || status.memberOf !== groupStatus.number) continue
        memberNumbers.push(status.number)
        repo.writeStatusJson(taskDir, {
          ...status,
          memberOf: groupStatus.memberOf,
        })
      }
      forestLayoutStore.translateOutOfGroup(groupStatus.number, memberNumbers)
    })
  }

  function getReferencedFileContent(folderName: string, refPath: string): Buffer {
    const dir = resolveTaskDir(folderName)
    const status = repo.readStatusJson(dir)
    if (!status) throw createValidationError(`Malformed task: ${folderName}`)
    const refs = status.references ?? []
    if (!refs.some((r) => r.path === refPath)) {
      throw createValidationError(`Path is not a registered reference of task ${status.number}: ${refPath}`, 'references')
    }
    if (!repo.exists(refPath)) {
      throw createNotFoundError(`Referenced file not found: ${refPath}`)
    }
    return repo.readFile(refPath)
  }

  function taskDirs(includeArchive: boolean): string[] {
    const dirs: string[] = []
    const scan = (parentDir: string) => {
      if (!repo.exists(parentDir)) return
      const entries = repo.listEntries(parentDir)
      for (const entry of entries) {
        if (!isTaskDirEntry(entry)) continue
        dirs.push(path.join(parentDir, entry.name))
      }
    }
    scan(worktreeDir)
    if (includeArchive) {
      scan(path.join(worktreeDir, 'archive'))
    }
    return dirs
  }

  function assertTaskNumberAvailable(number: string, excludedDir?: string): void {
    const normalized = normalizeTaskNumber(number)
    for (const taskDir of taskDirs(true)) {
      if (taskDir === excludedDir) continue
      const status = repo.readStatusJson(taskDir)
      if (status && normalizeTaskNumber(status.number) === normalized) {
        throw createValidationError(`Task Number already exists: ${status.number}`, 'number')
      }
    }
  }

  function resolveUniqueFolderPath(baseName: string): string {
    let dir = path.join(worktreeDir, baseName)
    if (!repo.exists(dir)) return dir
    let i = 2
    while (true) {
      dir = path.join(worktreeDir, `${baseName}-${i}`)
      if (!repo.exists(dir)) return dir
      i++
    }
  }

  return {
    get orderStore() {
      return orderStore
    },
    get forestLayoutStore() {
      return forestLayoutStore
    },
    getTask,
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    archiveTask,
    setUseWorktree,
    saveAgentWorktreeInfo,
    selectAgentWorktree,
    markAgentWorktreeRemoved,
    getTaskContext,
    deleteTaskContext,
    saveTaskContext,
    listAllTaskNumbers,
    suggestNextNumber,
    loadBoardSnapshot,
    listTaskFiles,
    copyFileToTask,
    deleteTaskFile,
    getFileContent,
    addReference,
    removeReference,
    addDependency,
    removeDependencies,
    createGroup,
    ungroup,
    getReferencedFileContent,
  }
}

export interface ListAllTaskNumbersResult {
  number: string
  createdAt?: string
}

export interface LoadBoardSnapshotResult {
  tasks: TaskInfo[]
  taskOrder: TaskOrder
  suggestedNextNumber: string | null
}
