import { succeed, fail, type Result } from '~/util/result.js'

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
    return succeed({
      type: 'success',
    })
  if (result.status === 'conflict')
    return succeed({
      type: 'conflict',
    })
  return fail(result.message || 'Sync failed')
}
