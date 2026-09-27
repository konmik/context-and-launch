import type { ConfigPaths } from '../config/config-paths.js'
import { createConfigRepository, type ConfigRepository } from '../config/config-repository.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import { decodeBoards, validateBoards, type BoardDefinition, type ColumnDefinition } from './board-config-data.js'

export type { BoardDefinition, ColumnDefinition } from './board-config-data.js'
export { validateColumnName } from './board-config-data.js'
export { slugifyColumnName } from '../../lib/slugify.js'

export interface BoardConfig {
  columns: ColumnDefinition[]
}

export interface BoardConfigManager {
  read(owner?: string): BoardDefinition[]
  write(boards: BoardDefinition[], owner?: string): BoardDefinition[]
  release(owner: string): void
  getDefaultBoardId(): string
  getConfig(boardId?: string | null): BoardConfig
}

export function createBoardConfigManager(
  paths: ConfigPaths,
  configRepo: ConfigRepository = createConfigRepository(),
  lock: UpdateLock = createUpdateLock(),
): BoardConfigManager {
  function read(owner?: string): BoardDefinition[] {
    return lock.read(() => {
      const file = paths.boardsFile()
      const raw = configRepo.readJson(file)
      if (raw === null) throw new Error(`boards.json not found: ${file}`)
      return decodeBoards(raw)
    }, owner)
  }

  function write(boards: BoardDefinition[], owner?: string): BoardDefinition[] {
    return lock.write(() => {
      const next = decodeBoards(boards)
      validateBoards(next)
      configRepo.writeJson(paths.boardsFile(), next)
      return next
    }, owner)
  }

  function release(owner: string): void {
    lock.release(owner)
  }

  function getDefaultBoardId(): string {
    return read()[0].id
  }

  function getConfig(boardId?: string | null): BoardConfig {
    const boards = read()
    return {
      columns: (boards.find((board) => board.id === boardId) ?? boards[0]).columns,
    }
  }

  return {
    read,
    write,
    release,
    getDefaultBoardId,
    getConfig,
  }
}
