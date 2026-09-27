import { appConfigStore } from '~/core/config/instances.js'
import type { AppConfigData } from '~/core/config/app-config-data.js'
import { failure, success, type Result } from '~/util/result.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export async function readAppConfig(owner?: string): Promise<Result<AppConfigData, UserFacingError>> {
  'use server'

  try {
    return success(appConfigStore.read(owner))
  } catch (error) {
    return failure(errorPayload(error, 'Load configuration failed'))
  }
}

export async function saveAppConfig(configJson: string, owner: string): Promise<Result<AppConfigData, UserFacingError>> {
  'use server'

  try {
    return owner
      ? success(appConfigStore.update(() => JSON.parse(configJson), owner))
      : failure({ title: 'Save failed', description: 'Configuration update requires a client identity.' })
  } catch (error) {
    return failure(errorPayload(error, 'Save configuration failed'))
  }
}

export async function releaseAppConfig(owner: string): Promise<void> {
  'use server'

  appConfigStore.release(owner)
}

export async function recordAppProjectFocus(projectSlug: string): Promise<Result<AppConfigData, UserFacingError>> {
  'use server'

  try {
    return success(await appConfigStore.recordProjectFocus(projectSlug))
  } catch (error) {
    return failure(errorPayload(error, 'Save project focus failed'))
  }
}
