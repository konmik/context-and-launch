import type { Result } from '~/util/result.js'
import { failure } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { errorPayload } from '~/core/shared/errors.js'
import { pickDirectory as pickDirectoryOnServer } from './shared-api.js'

export async function pickDirectory(preselect: string): Promise<Result<string | undefined, UserFacingError>> {
  const desktopPicker = globalThis.window?.contextLaunch?.pickDirectory
  try {
    if (!desktopPicker) return await pickDirectoryOnServer(preselect)
    const result = await desktopPicker(preselect)
    return result.type === 'Failure' ? failure(errorPayload(result.error, 'Browse failed')) : result
  } catch (error) {
    return failure(errorPayload(error, 'Browse failed'))
  }
}
