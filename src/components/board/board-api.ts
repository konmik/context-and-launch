import { boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager } from '~/core/config/instances.js'
import { migrateColumnRename, type MigrationScope } from '~/core/project/column-rename-migration.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { BoardDefinition } from '~/core/project/board-config-data.js'
import { failure, success, type Result } from '~/util/result.js'

export type BoardRef = Pick<BoardDefinition, 'id' | 'name'>

export async function readBoards(owner?: string): Promise<Result<BoardDefinition[], UserFacingError>> {
  'use server'

  try {
    return success(boardConfigManager.read(owner))
  } catch (error) {
    return failure(errorPayload(error, 'Load boards failed'))
  }
}

export async function releaseBoards(owner: string): Promise<void> {
  'use server'

  boardConfigManager.release(owner)
}

export async function saveBoards(json: string, owner: string): Promise<Result<BoardDefinition[], UserFacingError>> {
  'use server'

  try {
    if (!owner) return failure({ title: 'Save failed', description: 'Configuration update requires a client identity.' })
    return success(boardConfigManager.write(JSON.parse(json), owner))
  } catch (error) {
    return failure(errorPayload(error, 'Save boards failed'))
  }
}

export async function migrateRenamedColumn(
  boardId: string,
  oldName: string,
  newName: string,
  scope: MigrationScope,
  currentProjectSlug: string,
): Promise<Result<void, UserFacingError>> {
  'use server'

  try {
    if (scope === 'current' && !currentProjectSlug) throw new Error('Missing current project')
    migrateColumnRename(boardId, oldName, newName, scope, currentProjectSlug, {
      boardConfigManager,
      projectRegistry,
      launcherConfigManager,
      worktreeManager,
    })
    return success(undefined)
  } catch (error) {
    return failure(errorPayload(error, 'Rename column failed'))
  }
}
