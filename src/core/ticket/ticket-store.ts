import path from 'path'
import type { Dirent } from 'fs'
import * as v from 'valibot'
import { createTicketOrderStore, type TicketOrderStore } from './ticket-order.js'
import { createForestLayoutStore, type ForestLayoutStore } from './forest-layout-store.js'
import { suggestNextTicketNumber } from './ticket-number.js'
import { toKebabCase, normalizeTicketNumber, requireNonBlank, requireSimpleName } from './ticket-naming.js'
import { createTicketRepository, type TicketRepository } from './ticket-repository.js'
import { createValidationError, createNotFoundError, createAppError, errorMessage } from '../shared/errors.js'
import { mapConcurrent } from '../shared/concurrency.js'
import {
  wouldCreateDependencyCycle,
  wouldCreateMembershipCycle,
  rewriteInboundReferences,
  removeInboundReferences,
  type TicketRelation,
} from './ticket-relations.js'
import type { StatusJson } from './ticket-repository.js'
import type { TicketOrder } from './ticket-order-data.js'
import { ticketAgentWorktrees, type TicketAgentWorktree } from './ticket-worktrees.js'

export { toKebabCase } from './ticket-naming.js'

const READ_CONCURRENCY = 32

const isTicketDirEntry = (entry: Dirent): boolean => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive'

export interface TicketInfo {
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
  agentWorktrees?: TicketAgentWorktree[]
  dependsOn?: string[]
  memberOf?: string
  createdAt?: string
}

export const CreateTicketBody = v.object({
  number: v.string(),
  title: v.string(),
})

export type CreateTicketBody = v.InferOutput<typeof CreateTicketBody>

export const UpdateTicketBody = v.object({
  number: v.optional(v.string()),
  title: v.optional(v.string()),
  status: v.optional(v.string()),
})

export type UpdateTicketBody = v.InferOutput<typeof UpdateTicketBody>

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

export interface TicketStore {
  readonly orderStore: TicketOrderStore
  readonly forestLayoutStore: ForestLayoutStore
  getTicket(folderName: string): TicketInfo | null
  listTickets(): TicketInfo[]
  createTicket(number: string, title: string, initialStatus?: string, memberOf?: string): TicketInfo
  updateTicket(
    folderName: string,
    number?: string | null,
    title?: string | null,
    status?: string | null,
    details?: Partial<Pick<StatusJson, 'useWorktree' | 'references'>>,
  ): TicketInfo
  deleteTicket(folderName: string): void
  archiveTicket(folderName: string): void
  setUseWorktree(folderName: string, value: boolean): void
  saveAgentWorktreeInfo(folderName: string, agentWorktreeBranchName: string, agentWorktreeDir: string, agentKey?: string): void
  selectAgentWorktree(folderName: string, worktreePath?: string): void
  markAgentWorktreeRemoved(folderName: string, worktreePath: string, cleanupComplete?: boolean): void
  getTicketContext(folderName: string, name: string): string | null
  deleteTicketContext(folderName: string, name: string): void
  saveTicketContext(folderName: string, name: string, content: string): void
  listAllTicketNumbers(): Array<ListAllTicketNumbersResult>
  suggestNextNumber(prefix?: string | null): string | null
  loadBoardSnapshot(columns: string[]): Promise<LoadBoardSnapshotResult>
  listTicketFiles(folderName: string): string[]
  copyFileToTicket(folderName: string, fileName: string, content: Buffer): void
  deleteTicketFile(folderName: string, fileName: string): void
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
  ): TicketInfo
  ungroup(folderName: string): void
  getReferencedFileContent(folderName: string, refPath: string): Buffer
}

export function createTicketStore(worktreeDir: string, repo: TicketRepository = createTicketRepository()): TicketStore {
  const orderStore = createTicketOrderStore(worktreeDir, repo)
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

  function resolveTicketDir(folderName: string): string {
    requireSimpleName(folderName, 'folderName')
    const dir = path.join(worktreeDir, folderName)
    requireContained(dir, 'folderName')
    if (!repo.isDirectory(dir)) {
      throw createNotFoundError(`Ticket not found: ${folderName}`)
    }
    return dir
  }

  function getTicket(folderName: string): TicketInfo | null {
    requireSimpleName(folderName, 'folderName')
    const dir = path.join(worktreeDir, folderName)
    requireContained(dir, 'folderName')
    if (!repo.isDirectory(dir)) return null
    return readTicket(dir)
  }

  function listTickets(): TicketInfo[] {
    const tickets: TicketInfo[] = []
    for (const dir of ticketDirs(false)) {
      const ticket = readTicket(dir)
      if (ticket) tickets.push(ticket)
    }
    return dedupeAndSortTickets(tickets)
  }

  function dedupeAndSortTickets(tickets: TicketInfo[]): TicketInfo[] {
    const numbers = new Map<string, string>()
    for (const ticket of tickets) {
      const normalizedNumber = normalizeTicketNumber(ticket.number)
      const existingNumber = numbers.get(normalizedNumber)
      if (existingNumber) {
        throw createValidationError(`Duplicate Ticket Number: ${existingNumber}`, 'number')
      }
      numbers.set(normalizedNumber, ticket.number)
    }
    tickets.sort((a, b) => a.number.toLowerCase().localeCompare(b.number.toLowerCase()))
    return tickets
  }

  function createTicket(number: string, title: string, initialStatus: string = 'todo', memberOf?: string): TicketInfo {
    if (!number.trim()) throw createValidationError('Ticket number must not be blank', 'number')
    if (!title.trim()) throw createValidationError('Ticket title must not be blank', 'title')
    assertTicketNumberAvailable(number)
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
    const ticket = readTicket(dir)!
    orderStore.appendTicket(ticket.folderName, initialStatus)
    return ticket
  }

  function updateTicket(
    folderName: string,
    number?: string | null,
    title?: string | null,
    status?: string | null,
    details: Partial<Pick<StatusJson, 'useWorktree' | 'references'>> = {},
  ): TicketInfo {
    return repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTicketDir(folderName)
      const current = repo.readStatusJson(dir)
      if (!current) throw createValidationError(`Malformed ticket: ${folderName}`)
      const updatedNumber = number != null ? requireNonBlank(number, 'Ticket number') : current.number
      const updatedTitle = title != null ? requireNonBlank(title, 'Ticket title') : current.title
      const updatedStatus = status ?? current.status
      const updated: StatusJson = {
        ...current,
        ...details,
        number: updatedNumber,
        title: updatedTitle,
        status: updatedStatus,
      }
      const numberChanged = number != null && number.trim() !== current.number
      const numberIdentityChanged = number != null && normalizeTicketNumber(number) !== normalizeTicketNumber(current.number)
      const needsRename = numberChanged || (title != null && title.trim() !== current.title)
      if (numberIdentityChanged) {
        assertTicketNumberAvailable(updatedNumber, dir)
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
              `Failed to rename ticket folder from ${path.basename(dir)} to ${newFolderName}: ${errorMessage(err)}`,
              'Rename ticket failed',
            )
          }
          finalDir = newDir
        }
      }
      repo.writeStatusJson(finalDir, updated)
      if (needsRename && path.basename(finalDir) !== folderName) {
        orderStore.renameTicket(folderName, path.basename(finalDir))
      }
      if (numberChanged) {
        for (const ticketDir of ticketDirs(true)) {
          if (ticketDir === finalDir) continue
          const status = repo.readStatusJson(ticketDir)
          if (!status) continue
          const rewritten = rewriteInboundReferences(status, current.number, updatedNumber)
          if (rewritten) repo.writeStatusJson(ticketDir, rewritten)
        }
        forestLayoutStore.renameTicket(current.number, updatedNumber)
      }
      return readTicket(finalDir)!
    })
  }

  function deleteTicket(folderName: string): void {
    repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTicketDir(folderName)
      const status = repo.readStatusJson(dir)
      const ticketNumber = status?.number
      repo.removeDirectory(dir)
      orderStore.removeTicket(folderName)
      if (ticketNumber) {
        for (const ticketDir of ticketDirs(true)) {
          const s = repo.readStatusJson(ticketDir)
          if (!s) continue
          const cleaned = removeInboundReferences(s, ticketNumber)
          if (cleaned) repo.writeStatusJson(ticketDir, cleaned)
        }
        forestLayoutStore.removeTicket(ticketNumber)
      }
    })
  }

  function archiveTicket(folderName: string): void {
    const dir = resolveTicketDir(folderName)
    const archiveDir = path.join(worktreeDir, 'archive')
    repo.createDirectory(archiveDir)
    const dest = path.join(archiveDir, folderName)
    if (repo.exists(dest)) {
      throw createValidationError(`Archive destination already exists: ${folderName}`)
    }
    repo.renameDirectory(dir, dest)
    orderStore.removeTicket(folderName)
  }

  function setUseWorktree(folderName: string, value: boolean): void {
    const dir = resolveTicketDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Ticket not found: ${folderName}`)
    repo.writeStatusJson(dir, {
      ...current,
      useWorktree: value,
    })
  }

  function saveAgentWorktreeInfo(folderName: string, agentWorktreeBranchName: string, agentWorktreeDir: string, agentKey?: string): void {
    const dir = resolveTicketDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Ticket not found: ${folderName}`)
    repo.writeStatusJson(dir, {
      ...current,
      agentWorktreeBranchName,
      agentWorktreeDir,
      agentWorktrees: [
        ...ticketAgentWorktrees(current).filter((entry) => entry.worktreePath !== agentWorktreeDir),
        {
          branchName: agentWorktreeBranchName,
          worktreePath: agentWorktreeDir,
          agentKey: agentKey ?? ticketAgentWorktrees(current).find((entry) => entry.worktreePath === agentWorktreeDir)?.agentKey,
        },
      ],
    })
  }

  function selectAgentWorktree(folderName: string, worktreePath?: string): void {
    const dir = resolveTicketDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Ticket not found: ${folderName}`)
    const agentWorktrees = ticketAgentWorktrees(current)
    const selected = agentWorktrees.find((entry) => entry.worktreePath === worktreePath && !entry.removed)
    if (worktreePath && !selected) throw createValidationError('The selected worktree does not belong to this ticket.')
    repo.writeStatusJson(dir, {
      ...current,
      agentWorktrees,
      useWorktree: !!selected,
      agentWorktreeBranchName: selected?.branchName ?? current.agentWorktreeBranchName,
      agentWorktreeDir: selected?.worktreePath ?? current.agentWorktreeDir,
    })
  }

  function markAgentWorktreeRemoved(folderName: string, worktreePath: string, cleanupComplete?: boolean): void {
    const dir = resolveTicketDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createNotFoundError(`Ticket not found: ${folderName}`)
    const agentWorktrees = ticketAgentWorktrees(current).map((entry) =>
      entry.worktreePath === worktreePath ? { ...entry, removed: true, cleanupComplete } : entry,
    )
    const selected = current.agentWorktreeDir === worktreePath
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

  function getTicketContext(folderName: string, name: string): string | null {
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

  function deleteTicketContext(folderName: string, name: string): void {
    requireSimpleName(name, 'name')
    const dir = resolveTicketDir(folderName)
    const file = path.join(dir, `${name}.md`)
    requireContained(file, 'name')
    requireContainedIn(file, dir, 'name')
    if (!repo.exists(file)) return
    repo.deleteFile(file)
  }

  function saveTicketContext(folderName: string, name: string, content: string): void {
    requireSimpleName(name, 'name')
    const dir = resolveTicketDir(folderName)
    const file = path.join(dir, `${name}.md`)
    requireContained(file, 'name')
    requireContainedIn(file, dir, 'name')
    repo.writeFile(file, content)
  }

  function listAllTicketNumbers(): Array<ListAllTicketNumbersResult> {
    const results: Array<{
      number: string
      createdAt?: string
    }> = []
    for (const dir of ticketDirs(true)) {
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
    return suggestNextTicketNumber(listAllTicketNumbers(), prefix)
  }

  function readTicket(dir: string): TicketInfo | null {
    const status = repo.readStatusJson(dir)
    if (!status) return null
    const entries = repo.listEntries(dir)
    const references = (status.references ?? []).map((ref) => ({
      path: ref.path,
      exists: repo.exists(ref.path),
    }))
    return buildTicketInfo(dir, status, entries, references)
  }

  function buildTicketInfo(
    dir: string,
    status: StatusJson,
    entries: Dirent[],
    references: {
      path: string
      exists: boolean
    }[],
  ): TicketInfo {
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
      agentWorktrees: ticketAgentWorktrees(status),
      dependsOn: status.dependsOn,
      memberOf: status.memberOf,
      createdAt: status.createdAt,
    }
  }

  async function loadBoardSnapshot(columns: string[]): Promise<LoadBoardSnapshotResult> {
    const activeDirs = await ticketDirsIn(worktreeDir)
    const tickets = dedupeAndSortTickets(
      (await mapConcurrent(activeDirs, READ_CONCURRENCY, (dir) => readTicketAsync(dir))).filter((t): t is TicketInfo => t !== null),
    )
    const ticketOrder = orderStore.reconcileAndSave(tickets, columns)
    const archiveDirs = await ticketDirsIn(path.join(worktreeDir, 'archive'))
    const archiveStatuses = archiveDirs.map((dir) => repo.readStatusJson(dir)).filter((s): s is StatusJson => s !== null)
    const suggestedNextNumber = suggestNextTicketNumber([...tickets, ...archiveStatuses])
    return {
      tickets,
      ticketOrder,
      suggestedNextNumber,
    }
  }

  async function ticketDirsIn(parentDir: string): Promise<string[]> {
    const entries = await repo.listEntriesAsync(parentDir)
    return entries.filter(isTicketDirEntry).map((e) => path.join(parentDir, e.name))
  }

  async function readTicketAsync(dir: string): Promise<TicketInfo | null> {
    const status = repo.readStatusJson(dir)
    if (!status) return null
    const entries = await repo.listEntriesAsync(dir)
    const references = (status.references ?? []).map((ref) => ({
      path: ref.path,
      exists: repo.exists(ref.path),
    }))
    return buildTicketInfo(dir, status, entries, references)
  }

  function listTicketFiles(folderName: string): string[] {
    const dir = resolveTicketDir(folderName)
    const entries = repo.listEntries(dir)
    return entries
      .filter((e) => e.isFile() && e.name !== 'status.json')
      .map((e) => e.name)
      .sort()
  }

  function copyFileToTicket(folderName: string, fileName: string, content: Buffer): void {
    requireSimpleName(fileName, 'fileName')
    if (fileName === 'status.json') {
      throw createValidationError('Cannot overwrite status.json', 'file')
    }
    const dir = resolveTicketDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    repo.writeFile(filePath, content)
  }

  function deleteTicketFile(folderName: string, fileName: string): void {
    requireSimpleName(fileName, 'fileName')
    if (fileName === 'status.json') {
      throw createValidationError('Cannot delete status.json', 'file')
    }
    const dir = resolveTicketDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    if (!repo.exists(filePath)) {
      throw createNotFoundError(`File not found: ${fileName}`)
    }
    repo.deleteFile(filePath)
  }

  function getFileContent(folderName: string, fileName: string): Buffer {
    requireSimpleName(fileName, 'fileName')
    const dir = resolveTicketDir(folderName)
    const filePath = path.join(dir, fileName)
    requireContainedIn(filePath, dir, 'fileName')
    if (!repo.exists(filePath)) {
      throw createNotFoundError(`File not found: ${fileName}`)
    }
    return repo.readFile(filePath)
  }

  function updateStatus(folderName: string, transform: (current: StatusJson) => StatusJson): void {
    const dir = resolveTicketDir(folderName)
    const current = repo.readStatusJson(dir)
    if (!current) throw createValidationError(`Malformed ticket: ${folderName}`)
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
      const tickets = listTickets()
      if (!tickets.some((ticket) => ticket.number === dependencyNumber)) {
        throw createValidationError(`Dependency target does not exist: ${dependencyNumber}`)
      }
      const existing = current.dependsOn ?? []
      if (existing.includes(dependencyNumber)) return current
      if (wouldCreateDependencyCycle(tickets, current.number, dependencyNumber)) {
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
  ): TicketInfo {
    return repo.runInTransaction(worktreeDir, () => {
      const memberInfos: Array<{
        dir: string
        status: StatusJson
      }> = []
      for (const fn of memberFolderNames) {
        const dir = resolveTicketDir(fn)
        const status = repo.readStatusJson(dir)
        if (!status) throw createNotFoundError(`Member ticket not found: ${fn}`)
        memberInfos.push({
          dir,
          status,
        })
      }
      const memberNumbers = memberInfos.map((m) => m.status.number)
      const allTickets: TicketRelation[] = listTickets()
      if (parentGroupNumber !== undefined) {
        allTickets.push({
          number,
          memberOf: parentGroupNumber,
        })
      }
      if (wouldCreateMembershipCycle(allTickets, memberNumbers, number)) {
        throw createValidationError('Grouping would create a membership cycle')
      }
      const groupTicket = createTicket(number, title, initialStatus, parentGroupNumber)
      for (const member of memberInfos) {
        repo.writeStatusJson(member.dir, {
          ...member.status,
          memberOf: number,
        })
      }
      if (position) {
        forestLayoutStore.translateIntoGroup(number, position, memberNumbers)
      }
      return groupTicket
    })
  }

  function ungroup(folderName: string): void {
    repo.runInTransaction(worktreeDir, () => {
      const dir = resolveTicketDir(folderName)
      const groupStatus = repo.readStatusJson(dir)
      if (!groupStatus) throw createValidationError(`Malformed ticket: ${folderName}`)
      const memberNumbers: string[] = []
      for (const ticketDir of ticketDirs(false)) {
        const status = repo.readStatusJson(ticketDir)
        if (!status || status.memberOf !== groupStatus.number) continue
        memberNumbers.push(status.number)
        repo.writeStatusJson(ticketDir, {
          ...status,
          memberOf: groupStatus.memberOf,
        })
      }
      forestLayoutStore.translateOutOfGroup(groupStatus.number, memberNumbers)
    })
  }

  function getReferencedFileContent(folderName: string, refPath: string): Buffer {
    const dir = resolveTicketDir(folderName)
    const status = repo.readStatusJson(dir)
    if (!status) throw createValidationError(`Malformed ticket: ${folderName}`)
    const refs = status.references ?? []
    if (!refs.some((r) => r.path === refPath)) {
      throw createValidationError(`Path is not a registered reference of ticket ${status.number}: ${refPath}`, 'references')
    }
    if (!repo.exists(refPath)) {
      throw createNotFoundError(`Referenced file not found: ${refPath}`)
    }
    return repo.readFile(refPath)
  }

  function ticketDirs(includeArchive: boolean): string[] {
    const dirs: string[] = []
    const scan = (parentDir: string) => {
      if (!repo.exists(parentDir)) return
      const entries = repo.listEntries(parentDir)
      for (const entry of entries) {
        if (!isTicketDirEntry(entry)) continue
        dirs.push(path.join(parentDir, entry.name))
      }
    }
    scan(worktreeDir)
    if (includeArchive) {
      scan(path.join(worktreeDir, 'archive'))
    }
    return dirs
  }

  function assertTicketNumberAvailable(number: string, excludedDir?: string): void {
    const normalized = normalizeTicketNumber(number)
    for (const ticketDir of ticketDirs(true)) {
      if (ticketDir === excludedDir) continue
      const status = repo.readStatusJson(ticketDir)
      if (status && normalizeTicketNumber(status.number) === normalized) {
        throw createValidationError(`Ticket Number already exists: ${status.number}`, 'number')
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
    getTicket,
    listTickets,
    createTicket,
    updateTicket,
    deleteTicket,
    archiveTicket,
    setUseWorktree,
    saveAgentWorktreeInfo,
    selectAgentWorktree,
    markAgentWorktreeRemoved,
    getTicketContext,
    deleteTicketContext,
    saveTicketContext,
    listAllTicketNumbers,
    suggestNextNumber,
    loadBoardSnapshot,
    listTicketFiles,
    copyFileToTicket,
    deleteTicketFile,
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

export interface ListAllTicketNumbersResult {
  number: string
  createdAt?: string
}

export interface LoadBoardSnapshotResult {
  tickets: TicketInfo[]
  ticketOrder: TicketOrder
  suggestedNextNumber: string | null
}
