import { readAppLogs, clearAppLogs } from '~/core/infra/app-logger.js'
import { success, failure, type Result } from '~/util/result.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export async function getAppLogs(): Promise<Result<string, UserFacingError>> {
  'use server'

  try {
    return success(readAppLogs())
  } catch (error) {
    return failure(errorPayload(error, 'Load logs failed'))
  }
}

export async function serverClearAppLogs(): Promise<Result<void, UserFacingError>> {
  'use server'

  try {
    clearAppLogs()
    return success(undefined)
  } catch (error) {
    return failure(errorPayload(error, 'Clear logs failed'))
  }
}
