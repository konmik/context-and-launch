import { success, failure, type Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export interface SuccessSyncResultType {
  type: 'success'
}

export interface ConflictSyncResultType {
  type: 'conflict'
}

export function parseSyncResult(result: {
  status: string
  message?: string
}): Result<SuccessSyncResultType | ConflictSyncResultType, UserFacingError> {
  if (result.status === 'success')
    return success({
      type: 'success',
    })
  if (result.status === 'conflict')
    return success({
      type: 'conflict',
    })
  return failure({
    title: 'Sync failed',
    description: result.message || 'Sync failed',
  })
}
