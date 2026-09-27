export interface SuccessSyncResultType {
  type: 'success'
}

export interface ConflictSyncResultType {
  type: 'conflict'
}

export interface ErrorSyncResultType {
  type: 'error'
  message: string
}

export type SyncResultType = SuccessSyncResultType | ConflictSyncResultType | ErrorSyncResultType

export function parseSyncResult(result: { status: string; message?: string }): SyncResultType {
  if (result.status === 'success')
    return {
      type: 'success',
    }
  if (result.status === 'conflict')
    return {
      type: 'conflict',
    }
  return {
    type: 'error',
    message: result.message || 'Sync failed',
  }
}
