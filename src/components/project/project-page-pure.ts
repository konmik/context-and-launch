import { success, failure, type Result } from '~/util/result.js'

export interface SuccessSyncResultType {
  type: 'success'
}

export interface ConflictSyncResultType {
  type: 'conflict'
}

export function parseSyncResult(result: {
  status: string
  message?: string
}): Result<SuccessSyncResultType | ConflictSyncResultType, string> {
  if (result.status === 'success')
    return success({
      type: 'success',
    })
  if (result.status === 'conflict')
    return success({
      type: 'conflict',
    })
  return failure(result.message || 'Sync failed')
}
