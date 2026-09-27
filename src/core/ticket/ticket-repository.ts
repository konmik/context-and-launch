import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import * as v from 'valibot'
import { createConfigRepository, type ConfigRepository } from '../config/config-repository.js'
import type { JsonValue } from '../shared/json.js'

export const StatusJsonSchema = v.looseObject({
  number: v.string(),
  title: v.string(),
  status: v.string(),
  useWorktree: v.optional(v.boolean(), false),
  createdAt: v.optional(v.string()),
  references: v.optional(
    v.array(
      v.looseObject({
        path: v.string(),
      }),
    ),
  ),
  agentWorktreeBranchName: v.optional(v.string()),
  agentWorktreeDir: v.optional(v.string()),
  dependsOn: v.optional(v.array(v.string())),
  memberOf: v.optional(v.string()),
})

export type StatusJson = v.InferOutput<typeof StatusJsonSchema>

function isEnoent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}

interface TransactionState {
  root: string
  undo: Array<() => void>
  finalize: Array<() => void>
}

export interface TicketRepository {
  runInTransaction<T>(root: string, operation: () => T): T
  readStatusJson(dir: string): StatusJson | null
  writeStatusJson(dir: string, status: StatusJson): void
  readWorktreeJson(worktreeDir: string, fileName: string): JsonValue | null
  writeWorktreeJson<Data extends object>(worktreeDir: string, fileName: string, data: Data): void
  listEntries(parentDir: string): fs.Dirent[]
  listEntriesAsync(parentDir: string): Promise<fs.Dirent[]>
  createDirectory(dir: string): void
  removeDirectory(dir: string): void
  renameDirectory(from: string, to: string): void
  readFile(filePath: string): Buffer
  readFileText(filePath: string): string
  writeFile(filePath: string, content: Buffer | string): void
  deleteFile(filePath: string): void
  exists(filePath: string): boolean
  isDirectory(filePath: string): boolean
  realpathSync(filePath: string): string
}

export function createTicketRepository(configRepo: ConfigRepository = createConfigRepository()): TicketRepository {
  let transactionState: TransactionState | null = null

  function runInTransaction<T>(root: string, operation: () => T): T {
    const normalizedRoot = path.resolve(root)
    if (transactionState) {
      if (transactionState.root !== normalizedRoot) {
        throw new Error('Cannot nest ticket transactions for different worktrees')
      }
      return operation()
    }
    const state: TransactionState = {
      root: normalizedRoot,
      undo: [],
      finalize: [],
    }
    transactionState = state
    try {
      const result = operation()
      transactionState = null
      for (const finalize of state.finalize) finalize()
      return result
    } catch (error) {
      transactionState = null
      const rollbackErrors: unknown[] = []
      for (const undo of [...state.undo].reverse()) {
        try {
          undo()
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError)
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Ticket mutation failed and could not be fully rolled back')
      }
      throw error
    }
  }

  function readStatusJson(dir: string): StatusJson | null {
    const file = path.join(dir, 'status.json')
    let raw: JsonValue | null
    try {
      raw = configRepo.readJson(file)
    } catch (err) {
      if (isEnoent(err)) return null
      if (err instanceof Error && 'code' in err) throw err
      console.warn(`Malformed status.json in ${dir}:`, err)
      return null
    }
    if (raw === null) return null
    const parsed = v.safeParse(StatusJsonSchema, raw)
    if (!parsed.success) {
      console.warn(`Malformed status.json in ${dir}:`, parsed.issues)
      return null
    }
    return parsed.output
  }

  function writeStatusJson(dir: string, status: StatusJson): void {
    writeJson(path.join(dir, 'status.json'), status)
  }

  function readWorktreeJson(worktreeDir: string, fileName: string): JsonValue | null {
    const filePath = path.join(worktreeDir, fileName)
    try {
      return configRepo.readJson(filePath)
    } catch (err) {
      console.warn(`Failed to read ${filePath}:`, err)
      return null
    }
  }

  function writeWorktreeJson<Data extends object>(worktreeDir: string, fileName: string, data: Data): void {
    writeJson(path.join(worktreeDir, fileName), data)
  }

  function listEntries(parentDir: string): fs.Dirent[] {
    try {
      return fs.readdirSync(parentDir, {
        withFileTypes: true,
      })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
  }

  async function listEntriesAsync(parentDir: string): Promise<fs.Dirent[]> {
    try {
      return await fs.promises.readdir(parentDir, {
        withFileTypes: true,
      })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
  }

  function createDirectory(dir: string): void {
    const existed = fs.existsSync(dir)
    fs.mkdirSync(dir, {
      recursive: true,
    })
    if (!existed && transactionState) {
      transactionState.undo.push(() =>
        fs.rmSync(dir, {
          recursive: true,
          force: true,
        }),
      )
    }
  }

  function removeDirectory(dir: string): void {
    if (transactionState && fs.existsSync(dir)) {
      const stagedPath = path.join(path.dirname(dir), `.context-launch-transaction-${randomUUID()}`)
      fs.renameSync(dir, stagedPath)
      transactionState.undo.push(() => fs.renameSync(stagedPath, dir))
      transactionState.finalize.push(() =>
        fs.rmSync(stagedPath, {
          recursive: true,
          force: true,
        }),
      )
      return
    }
    fs.rmSync(dir, {
      recursive: true,
      force: true,
    })
  }

  function renameDirectory(from: string, to: string): void {
    fs.renameSync(from, to)
    if (transactionState) {
      transactionState.undo.push(() => fs.renameSync(to, from))
    }
  }

  function readFile(filePath: string): Buffer {
    return fs.readFileSync(filePath)
  }

  function readFileText(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
  }

  function writeFile(filePath: string, content: Buffer | string): void {
    writeWithUndo(filePath, () => fs.writeFileSync(filePath, content))
  }

  function deleteFile(filePath: string): void {
    const before = captureFile(filePath)
    fs.unlinkSync(filePath)
    recordFileUndo(filePath, before)
  }

  function exists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }

  function isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory()
    } catch (err) {
      if (isEnoent(err)) return false
      throw err
    }
  }

  function realpathSync(filePath: string): string {
    return fs.realpathSync(filePath)
  }

  function writeJson<Data extends object>(filePath: string, data: Data): void {
    writeWithUndo(filePath, () => configRepo.writeJson(filePath, data))
  }

  function writeWithUndo(filePath: string, write: () => void): void {
    const before = captureFile(filePath)
    try {
      write()
    } catch (error) {
      restoreFile(filePath, before)
      throw error
    }
    recordFileUndo(filePath, before)
  }

  function captureFile(filePath: string): Buffer | null {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
  }

  function recordFileUndo(filePath: string, before: Buffer | null): void {
    if (transactionState) {
      transactionState.undo.push(() => restoreFile(filePath, before))
    }
  }

  function restoreFile(filePath: string, before: Buffer | null): void {
    if (before === null) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    }
    fs.mkdirSync(path.dirname(filePath), {
      recursive: true,
    })
    fs.writeFileSync(filePath, before)
  }

  return {
    runInTransaction,
    readStatusJson,
    writeStatusJson,
    readWorktreeJson,
    writeWorktreeJson,
    listEntries,
    listEntriesAsync,
    createDirectory,
    removeDirectory,
    renameDirectory,
    readFile,
    readFileText,
    writeFile,
    deleteFile,
    exists,
    isDirectory,
    realpathSync,
  }
}
