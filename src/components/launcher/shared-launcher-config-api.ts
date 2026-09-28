import { sharedLauncherConfigStore } from '~/core/config/instances.js'
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js'
import { failure, success, type Result } from '~/util/result.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export async function readSharedLauncherConfig(owner?: string): Promise<Result<LauncherConfig, UserFacingError>> {
  'use server'

  try {
    return success(sharedLauncherConfigStore.read(owner))
  } catch (error) {
    return failure(errorPayload(error, 'Load launcher settings failed'))
  }
}

export async function releaseSharedLauncherConfig(owner: string): Promise<void> {
  'use server'

  sharedLauncherConfigStore.release(owner)
}

export async function saveSharedLauncherConfig(json: string, owner: string): Promise<Result<LauncherConfig, UserFacingError>> {
  'use server'

  try {
    return owner
      ? success(sharedLauncherConfigStore.write(JSON.parse(json), owner))
      : failure({
          title: 'Save failed',
          description: 'Configuration update requires a client identity.',
        })
  } catch (error) {
    return failure(errorPayload(error, 'Save launcher settings failed'))
  }
}
